import json
from decimal import Decimal
from unittest.mock import patch

import httpx
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from mistralai.client import Mistral
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur
from ..analyse_coherence import PROMPT_SYSTEME, ResultatCoherence, _simuler, construire_entree
from ..models import (
    Attestation, DecisionDemande, Demande, DemandeComplement, FormulaireRisque,
    Notification, ProjetAttestation, StatutDemande,
)
from ..projet_attestation import generer_contenu_initial
from .test_projet_attestation import _valeurs_fdr_complet


COHERENT = {"coherent": True, "resume": "Aucune incohérence factuelle détectée.", "anomalies": []}
ANOMALIE = {
    "type": "VALEUR_DIFFERENTE", "champ": "montant_total", "valeur_fdr": "100000.00",
    "valeur_attestation": "10000.00", "message": "Le montant total du chantier diffère.",
}


@override_settings(AI_COHERENCE_BACKEND="mistral", MISTRAL_API_KEY="cle-factice", MISTRAL_MODEL="modele-test")
class AnalyseCoherenceTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.distributeur = Utilisateur.objects.create_user(username="agent-coherence", role=Role.DISTRIBUTEUR)
        cls.siege = Utilisateur.objects.create_user(username="siege-coherence", role=Role.SIEGE)
        cls.demande = Demande.objects.create(distributeur=cls.distributeur, statut=StatutDemande.EN_COURS)
        cls.fdr = FormulaireRisque.objects.create(demande=cls.demande, **_valeurs_fdr_complet())
        cls.attestation = Attestation.objects.create(
            demande=cls.demande, contenu_html=generer_contenu_initial(cls.fdr, preparation=True),
        )

    def setUp(self):
        self.client.force_authenticate(self.siege)
        self.url = reverse("siege-demande-analyser-coherence-attestation", kwargs={"pk": self.demande.pk})
        self.entrees = []
        self.resultat = dict(COHERENT)
        self.provider_status = 200
        self.finish_reason = "stop"
        self.provider_error = None
        self.choix_vides = False
        self.provider = patch("demandes.analyse_coherence.Mistral", side_effect=self.creer_client).start()
        self.addCleanup(patch.stopall)

    def creer_client(self, **kwargs):
        return Mistral(**kwargs, client=httpx.Client(transport=httpx.MockTransport(self.repondre)))

    def repondre(self, request):
        self.entrees.append(json.loads(request.content))
        if self.provider_error:
            raise self.provider_error
        contenu = self.resultat if isinstance(self.resultat, str) else json.dumps(self.resultat)
        return httpx.Response(self.provider_status, json={
            "id": "test", "object": "chat.completion", "created": 1, "model": "modele-test",
            "choices": [] if self.choix_vides else [{
                "index": 0, "finish_reason": self.finish_reason,
                "message": {"role": "assistant", "content": contenu},
            }],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        })

    def verifier_aucune_ecriture(self, etat_demande, etat_attestation):
        self.assertEqual(Demande.objects.values().get(pk=self.demande.pk), etat_demande)
        self.assertEqual(Attestation.objects.values().get(pk=self.attestation.pk), etat_attestation)
        self.assertFalse(Notification.objects.exists())

    def test_coherent_schema_sdk_et_aucune_ecriture(self):
        avant_demande = Demande.objects.values().get(pk=self.demande.pk)
        avant_attestation = Attestation.objects.values().get(pk=self.attestation.pk)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data, {**COHERENT, "backend": "mistral"})
        self.assertEqual(len(self.entrees), 1)
        requete = self.entrees[0]
        self.assertEqual(requete["model"], "modele-test")
        self.assertEqual(requete["response_format"]["type"], "json_schema")
        schema = requete["response_format"]["json_schema"]["schema"]
        self.assertEqual(set(schema["required"]), {"coherent", "resume", "anomalies"})
        self.assertFalse(schema["additionalProperties"])
        self.verifier_aucune_ecriture(avant_demande, avant_attestation)

    def test_anomalies_et_complement_actif(self):
        DemandeComplement.objects.create(demande=self.demande, message="Précisions")
        self.resultat = {"coherent": False, "resume": "Un écart factuel détecté.", "anomalies": [ANOMALIE]}
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["anomalies"], [ANOMALIE])
        self.demande.refresh_from_db()
        self.attestation.refresh_from_db()
        self.assertEqual(self.demande.statut, StatutDemande.EN_COURS)
        self.assertIsNone(self.demande.decision)
        self.assertIsNone(self.attestation.validated_at)
        self.assertFalse(self.attestation.pdf_final)
        self.assertFalse(Notification.objects.exists())

    def test_entree_fdr_et_derniere_attestation_siege_jamais_projet(self):
        ProjetAttestation.objects.create(demande=self.demande, contenu_html="SECRET PROJET DISTRIBUTEUR")
        url_attestation = reverse("siege-demande-attestation", kwargs={"pk": self.demande.pk})
        self.client.patch(url_attestation, {"contenu_html": "<p>SIÈGE &amp; enregistré<br>Montant : <strong>10000.00</strong></p>"})
        response = self.client.post(self.url, {"contenu_html": "CONTENU NON ENREGISTRÉ"})
        self.assertEqual(response.status_code, 200)
        messages = self.entrees[0]["messages"]
        self.assertIn(PROMPT_SYSTEME, messages[0]["content"])
        entree = json.loads(messages[1]["content"])
        self.assertEqual(set(entree), {"fdr", "attestation"})
        self.assertEqual(entree["attestation"], "SIÈGE & enregistré\nMontant : 10000.00")
        self.assertEqual(entree["fdr"]["assure_nom"], self.fdr.assure_nom)
        self.assertEqual(entree["fdr"]["montant_total"], "100000.00")
        self.assertEqual(entree["fdr"]["date_fin"], "2026-06-30")
        self.assertNotIn("SECRET PROJET", json.dumps(messages))
        for champ in ["distributeur", "demande", "id", "fdr_pdf", "pieces", "statut", "decision"]:
            self.assertNotIn(champ, entree["fdr"])

    def test_sanitization_texte(self):
        self.attestation.contenu_html = '<p onclick="secret">Un <strong>mot</strong>.</p><p>Deux&nbsp;mots</p><img src="secret">'
        entree = construire_entree(self.fdr, self.attestation)
        self.assertEqual(entree["attestation"], "Un mot.\nDeux mots")

    def test_champs_hors_perimetre_jamais_envoyes(self):
        # Ces champs ne sont jamais rendus par generer_contenu_initial() :
        # même dans les conditions qui les rendaient auparavant "actifs"
        # (RENOVATION, usage AUTRE, activité non couverte), ils ne doivent
        # jamais apparaître dans entree["fdr"].
        self.fdr.type_chantier = "RENOVATION"
        self.fdr.modification_structure = True
        self.fdr.usage = "AUTRE"
        self.fdr.usage_autre_texte = "À exclure"
        self.fdr.activite_couverte = False
        self.fdr.activite_non_couverte_texte = "À exclure"
        self.fdr.travaux_standards = False
        self.fdr.chantier_atypique = False
        entree = construire_entree(self.fdr, self.attestation)
        for champ in [
            "modification_structure", "usage", "usage_autre_texte",
            "activite_couverte", "activite_non_couverte_texte",
            "travaux_standards", "chantier_atypique",
        ]:
            self.assertNotIn(champ, entree["fdr"])

    def test_valeur_falsy_non_supprimee(self):
        self.fdr.montant_total = Decimal("0.00")
        entree = construire_entree(self.fdr, self.attestation)
        self.assertEqual(entree["fdr"]["montant_total"], "0.00")

    def test_prompt_demande_comparaison_semantique_non_litterale(self):
        # Insensible au retour à la ligne du prompt multi-lignes : seul le
        # contenu importe, pas son découpage en lignes.
        texte = " ".join(PROMPT_SYSTEME.split())
        self.assertIn("par son sens et sa valeur, jamais par correspondance littérale avec le nom technique", texte)
        self.assertIn("Contrat n°", texte)
        self.assertIn("cette contrainte porte sur ta réponse, jamais sur ta recherche", texte)

    def verifier_indisponible(self):
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data, {
            "code": "IA_INDISPONIBLE", "detail": "Le contrôle de cohérence est indisponible. Réessayez plus tard.",
        })

    def test_erreur_provider_et_timeout_sans_fallback(self):
        for erreur in [httpx.ReadTimeout("secret"), httpx.ConnectError("secret")]:
            with self.subTest(erreur=type(erreur)):
                self.provider_error = erreur
                self.verifier_indisponible()
        self.provider_error = None
        for code in [401, 429, 503]:
            with self.subTest(code=code):
                self.provider_status = code
                self.verifier_indisponible()
        self.assertEqual(len(self.entrees), 5)

    def test_reponses_invalides_maitrisees(self):
        for resultat in [
            "pas du JSON", {}, {**COHERENT, "coherent": "true"}, {**COHERENT, "decision": "ACCEPTEE"},
            {**COHERENT, "anomalies": [ANOMALIE]},
            {"coherent": False, "resume": "Écart", "anomalies": [{**ANOMALIE, "type": "ACCEPTER"}]},
            {"coherent": False, "resume": "Écart", "anomalies": [{**ANOMALIE, "champ": "usage_autre_texte"}]},
        ]:
            with self.subTest(resultat=resultat):
                self.resultat = resultat
                self.verifier_indisponible()
        self.resultat = COHERENT
        self.finish_reason = "length"
        self.verifier_indisponible()
        self.choix_vides = True
        self.verifier_indisponible()

    def test_attestation_absente(self):
        self.attestation.delete()
        self.assertEqual(self.client.post(self.url).status_code, 404)
        self.provider.assert_not_called()

    def test_attestation_validee(self):
        Attestation.objects.filter(pk=self.attestation.pk).update(validated_at=timezone.now())
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "ATTESTATION_DEJA_VALIDEE")
        self.provider.assert_not_called()

    def test_roles_interdits(self):
        for utilisateur, code in [(self.distributeur, 403), (None, 401)]:
            self.client.force_authenticate(utilisateur)
            self.assertEqual(self.client.post(self.url).status_code, code)
        self.provider.assert_not_called()

    def test_etats_interdits(self):
        for statut, decision in [
            (StatutDemande.BROUILLON, None), (StatutDemande.TRAITE, None),
            (StatutDemande.EN_COURS, DecisionDemande.ACCEPTEE),
            (StatutDemande.EN_COURS, DecisionDemande.REFUSEE),
        ]:
            Demande.objects.filter(pk=self.demande.pk).update(statut=statut, decision=decision)
            self.assertEqual(self.client.post(self.url).status_code, 409)
        self.provider.assert_not_called()

    def test_configuration_invalide_ou_cle_absente(self):
        for configuration in [{"AI_COHERENCE_BACKEND": "inconnu"}, {"MISTRAL_API_KEY": ""}]:
            with self.settings(**configuration):
                self.verifier_indisponible()
        self.provider.assert_not_called()

    @override_settings(AI_COHERENCE_BACKEND="simulation", MISTRAL_API_KEY="")
    def test_simulation_compare_deterministement_les_champs_principaux(self):
        contenu = generer_contenu_initial(self.fdr, preparation=True)
        cas = [
            ("assure_nom", "AXA Construction", "Entreprise différente"),
            ("assure_ville", "Paris", "Ville différente"),
            ("assure_numero_contrat", "1234567890123", "987654321"),
            ("chantier_nom", "Tour Horizon", "Chantier différent"),
            ("chantier_ville", "Lyon", "Autre ville"),
            ("type_chantier", "Construction neuve", "Rénovation"),
            ("date_debut", "10/01/2026", "11/01/2026"),
            ("date_fin", "30/06/2026", "30/06/2027"),
            ("montant_total", "100 000,00", "120 000,00"),
            ("intervention_montant_prestation", "50 000,00", "45 000,00"),
            ("intervention_type", "Entreprise principale", "Sous-traitant"),
        ]
        for champ, valeur_fdr, valeur_attestation in cas:
            with self.subTest(champ=champ):
                Attestation.objects.filter(pk=self.attestation.pk).update(
                    contenu_html=contenu.replace(valeur_fdr, valeur_attestation)
                )
                response = self.client.post(self.url)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data["backend"], "simulation")
                resultat = ResultatCoherence.model_validate(
                    {cle: valeur for cle, valeur in response.data.items() if cle != "backend"}
                )
                self.assertFalse(resultat.coherent)
                self.assertEqual(len(resultat.anomalies), 1)
                self.assertEqual(resultat.anomalies[0].champ, champ)
                self.assertEqual(resultat.anomalies[0].type, "VALEUR_DIFFERENTE")
                self.assertEqual(resultat.anomalies[0].valeur_attestation, valeur_attestation.replace("\xa0", " "))

    @override_settings(AI_COHERENCE_BACKEND="simulation", MISTRAL_API_KEY="")
    def test_simulation_information_absente(self):
        contenu = generer_contenu_initial(self.fdr).replace(
            "<p>Type d'intervention : Entreprise principale</p>", ""
        )
        Attestation.objects.filter(pk=self.attestation.pk).update(contenu_html=contenu)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, 200)
        anomalie = next(item for item in response.data["anomalies"] if item["champ"] == "intervention_type")
        self.assertEqual(anomalie["type"], "INFORMATION_ABSENTE")
        self.assertEqual(anomalie["valeur_attestation"], "")

    @override_settings(AI_COHERENCE_BACKEND="simulation", MISTRAL_API_KEY="")
    def test_simulation_montant_et_date_errones_puis_correction(self):
        contenu = generer_contenu_initial(self.fdr, preparation=True)
        contenu_errone = contenu.replace("100 000,00", "10 000,00").replace("30/06/2026", "30/06/2027")
        Attestation.objects.filter(pk=self.attestation.pk).update(contenu_html=contenu_errone)
        incoherent = self.client.post(self.url)
        self.assertEqual(incoherent.status_code, 200)
        self.assertEqual(incoherent.data["backend"], "simulation")
        self.assertFalse(incoherent.data["coherent"])
        self.assertEqual(
            {anomalie["champ"] for anomalie in incoherent.data["anomalies"]},
            {"montant_total", "date_fin"},
        )
        Attestation.objects.filter(pk=self.attestation.pk).update(contenu_html=contenu)
        coherent = self.client.post(self.url)
        self.assertEqual(coherent.status_code, 200)
        self.assertTrue(coherent.data["coherent"])
        self.assertEqual(coherent.data["anomalies"], [])
        self.assertEqual(
            coherent.data["resume"],
            "Aucune incohérence détectée entre le FDR et l'attestation enregistrée.",
        )
        self.provider.assert_not_called()

    def test_simulation_villes_et_type_chantier_identiques_avec_variations(self):
        contenu = generer_contenu_initial(self.fdr, preparation=True)
        contenu_varie = (
            contenu.replace("Paris", "  PARIS  ")
            .replace("Lyon", "lyon")
            .replace("Construction neuve", "CONSTRUCTION NEUVE")
        )
        entree = construire_entree(self.fdr, Attestation(contenu_html=contenu_varie))
        resultat = _simuler(entree)
        self.assertEqual(resultat.anomalies, [])

    def test_simulation_ville_identique_malgre_accents(self):
        self.fdr.assure_ville = "Orléans"
        contenu = generer_contenu_initial(self.fdr, preparation=True).replace("Orléans", "ORLEANS")
        entree = construire_entree(self.fdr, Attestation(contenu_html=contenu))
        resultat = _simuler(entree)
        self.assertNotIn("assure_ville", {a.champ for a in resultat.anomalies})

    def test_simulation_bloc_assure_ligne_manquante_echoue_pour_les_deux_champs(self):
        contenu = generer_contenu_initial(self.fdr, preparation=True)
        for bloc_restant in ["<p>AXA Construction</p>", "<p>Paris</p>"]:
            with self.subTest(bloc_restant=bloc_restant):
                contenu_incomplet = contenu.replace("<p>AXA Construction<br>Paris</p>", bloc_restant)
                entree = construire_entree(self.fdr, Attestation(contenu_html=contenu_incomplet))
                resultat = _simuler(entree)
                anomalies_bloc = [a for a in resultat.anomalies if a.champ in {"assure_nom", "assure_ville"}]
                self.assertEqual({a.champ for a in anomalies_bloc}, {"assure_nom", "assure_ville"})
                self.assertTrue(all(a.type == "INFORMATION_ABSENTE" for a in anomalies_bloc))

    def test_simulation_bloc_chantier_ligne_manquante_echoue_pour_les_deux_champs(self):
        contenu = generer_contenu_initial(self.fdr, preparation=True)
        for bloc_restant in ["<p>Tour Horizon</p>", "<p>Lyon</p>"]:
            with self.subTest(bloc_restant=bloc_restant):
                contenu_incomplet = contenu.replace("<p>Tour Horizon<br>Lyon</p>", bloc_restant)
                entree = construire_entree(self.fdr, Attestation(contenu_html=contenu_incomplet))
                resultat = _simuler(entree)
                anomalies_bloc = [a for a in resultat.anomalies if a.champ in {"chantier_nom", "chantier_ville"}]
                self.assertEqual({a.champ for a in anomalies_bloc}, {"chantier_nom", "chantier_ville"})
                self.assertTrue(all(a.type == "INFORMATION_ABSENTE" for a in anomalies_bloc))

    def test_intervention_description_hors_perimetre_simulation(self):
        self.fdr.intervention_description = "Description totalement différente du texte de l'attestation"
        entree = construire_entree(self.fdr, self.attestation)
        resultat = _simuler(entree)
        self.assertNotIn("intervention_description", {a.champ for a in resultat.anomalies})
