from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur
from ..analyse_coherence import ResultatCoherence, _analyser_par_regles, construire_entree
from ..models import (
    Attestation, DecisionDemande, Demande, DemandeComplement, FormulaireRisque,
    Notification, ProjetAttestation, StatutDemande,
)
from ..projet_attestation import generer_contenu_initial
from .test_projet_attestation import _valeurs_fdr_complet


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

    def verifier_aucune_ecriture(self, etat_demande, etat_attestation):
        self.assertEqual(Demande.objects.values().get(pk=self.demande.pk), etat_demande)
        self.assertEqual(Attestation.objects.values().get(pk=self.attestation.pk), etat_attestation)
        self.assertFalse(Notification.objects.exists())

    def test_coherent_et_aucune_ecriture(self):
        avant_demande = Demande.objects.values().get(pk=self.demande.pk)
        avant_attestation = Attestation.objects.values().get(pk=self.attestation.pk)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["coherent"])
        self.assertEqual(response.data["anomalies"], [])
        self.verifier_aucune_ecriture(avant_demande, avant_attestation)

    def test_anomalies_et_complement_actif(self):
        DemandeComplement.objects.create(demande=self.demande, message="Précisions")
        contenu = generer_contenu_initial(self.fdr, preparation=True).replace("100 000,00", "10 000,00")
        Attestation.objects.filter(pk=self.attestation.pk).update(contenu_html=contenu)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual({a["champ"] for a in response.data["anomalies"]}, {"montant_total"})
        self.demande.refresh_from_db()
        self.attestation.refresh_from_db()
        self.assertEqual(self.demande.statut, StatutDemande.EN_COURS)
        self.assertIsNone(self.demande.decision)
        self.assertIsNone(self.attestation.validated_at)
        self.assertFalse(self.attestation.pdf_final)
        self.assertFalse(Notification.objects.exists())

    def test_analyse_utilise_attestation_siege_jamais_projet_attestation(self):
        ProjetAttestation.objects.create(demande=self.demande, contenu_html="SECRET PROJET DISTRIBUTEUR")
        url_attestation = reverse("siege-demande-attestation", kwargs={"pk": self.demande.pk})
        self.client.patch(url_attestation, {"contenu_html": generer_contenu_initial(self.fdr, preparation=True)})
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["coherent"])
        self.assertNotIn("SECRET PROJET", str(response.data))

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

    def test_attestation_absente(self):
        self.attestation.delete()
        self.assertEqual(self.client.post(self.url).status_code, 404)

    def test_attestation_validee(self):
        Attestation.objects.filter(pk=self.attestation.pk).update(validated_at=timezone.now())
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "ATTESTATION_DEJA_VALIDEE")

    def test_roles_interdits(self):
        for utilisateur, code in [(self.distributeur, 403), (None, 401)]:
            self.client.force_authenticate(utilisateur)
            self.assertEqual(self.client.post(self.url).status_code, code)

    def test_etats_interdits(self):
        for statut, decision in [
            (StatutDemande.BROUILLON, None), (StatutDemande.TRAITE, None),
            (StatutDemande.EN_COURS, DecisionDemande.ACCEPTEE),
            (StatutDemande.EN_COURS, DecisionDemande.REFUSEE),
        ]:
            Demande.objects.filter(pk=self.demande.pk).update(statut=statut, decision=decision)
            self.assertEqual(self.client.post(self.url).status_code, 409)

    def test_compare_deterministement_les_champs_principaux(self):
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
                resultat = ResultatCoherence.model_validate(response.data)
                self.assertFalse(resultat.coherent)
                self.assertEqual(len(resultat.anomalies), 1)
                self.assertEqual(resultat.anomalies[0].champ, champ)
                self.assertEqual(resultat.anomalies[0].type, "VALEUR_DIFFERENTE")
                self.assertEqual(resultat.anomalies[0].valeur_attestation, valeur_attestation.replace("\xa0", " "))

    def test_information_absente(self):
        contenu = generer_contenu_initial(self.fdr).replace(
            "<p>Type d'intervention : Entreprise principale</p>", ""
        )
        Attestation.objects.filter(pk=self.attestation.pk).update(contenu_html=contenu)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, 200)
        anomalie = next(item for item in response.data["anomalies"] if item["champ"] == "intervention_type")
        self.assertEqual(anomalie["type"], "INFORMATION_ABSENTE")
        self.assertEqual(anomalie["valeur_attestation"], "")

    def test_montant_et_date_errones_puis_correction(self):
        contenu = generer_contenu_initial(self.fdr, preparation=True)
        contenu_errone = contenu.replace("100 000,00", "10 000,00").replace("30/06/2026", "30/06/2027")
        Attestation.objects.filter(pk=self.attestation.pk).update(contenu_html=contenu_errone)
        incoherent = self.client.post(self.url)
        self.assertEqual(incoherent.status_code, 200)
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

    def test_villes_et_type_chantier_identiques_avec_variations(self):
        contenu = generer_contenu_initial(self.fdr, preparation=True)
        contenu_varie = (
            contenu.replace("Paris", "  PARIS  ")
            .replace("Lyon", "lyon")
            .replace("Construction neuve", "CONSTRUCTION NEUVE")
        )
        entree = construire_entree(self.fdr, Attestation(contenu_html=contenu_varie))
        resultat = _analyser_par_regles(entree)
        self.assertEqual(resultat.anomalies, [])

    def test_ville_identique_malgre_accents(self):
        self.fdr.assure_ville = "Orléans"
        contenu = generer_contenu_initial(self.fdr, preparation=True).replace("Orléans", "ORLEANS")
        entree = construire_entree(self.fdr, Attestation(contenu_html=contenu))
        resultat = _analyser_par_regles(entree)
        self.assertNotIn("assure_ville", {a.champ for a in resultat.anomalies})

    def test_bloc_assure_ligne_manquante_echoue_pour_les_deux_champs(self):
        contenu = generer_contenu_initial(self.fdr, preparation=True)
        for bloc_restant in ["<p>AXA Construction</p>", "<p>Paris</p>"]:
            with self.subTest(bloc_restant=bloc_restant):
                contenu_incomplet = contenu.replace("<p>AXA Construction<br>Paris</p>", bloc_restant)
                entree = construire_entree(self.fdr, Attestation(contenu_html=contenu_incomplet))
                resultat = _analyser_par_regles(entree)
                anomalies_bloc = [a for a in resultat.anomalies if a.champ in {"assure_nom", "assure_ville"}]
                self.assertEqual({a.champ for a in anomalies_bloc}, {"assure_nom", "assure_ville"})
                self.assertTrue(all(a.type == "INFORMATION_ABSENTE" for a in anomalies_bloc))

    def test_bloc_chantier_ligne_manquante_echoue_pour_les_deux_champs(self):
        contenu = generer_contenu_initial(self.fdr, preparation=True)
        for bloc_restant in ["<p>Tour Horizon</p>", "<p>Lyon</p>"]:
            with self.subTest(bloc_restant=bloc_restant):
                contenu_incomplet = contenu.replace("<p>Tour Horizon<br>Lyon</p>", bloc_restant)
                entree = construire_entree(self.fdr, Attestation(contenu_html=contenu_incomplet))
                resultat = _analyser_par_regles(entree)
                anomalies_bloc = [a for a in resultat.anomalies if a.champ in {"chantier_nom", "chantier_ville"}]
                self.assertEqual({a.champ for a in anomalies_bloc}, {"chantier_nom", "chantier_ville"})
                self.assertTrue(all(a.type == "INFORMATION_ABSENTE" for a in anomalies_bloc))

    def test_intervention_description_hors_perimetre(self):
        self.fdr.intervention_description = "Description totalement différente du texte de l'attestation"
        entree = construire_entree(self.fdr, self.attestation)
        resultat = _analyser_par_regles(entree)
        self.assertNotIn("intervention_description", {a.champ for a in resultat.anomalies})
