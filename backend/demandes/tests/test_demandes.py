import shutil
import tempfile
import uuid
from pathlib import Path

from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, connection, transaction
from django.db.models.deletion import ProtectedError
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur

from ..models import (
    Attestation,
    DecisionDemande,
    Demande,
    DemandeComplement,
    FormulaireRisque,
    PieceJustificative,
    StatutDemande,
    TypeChantier,
    TypeIntervention,
    Usage,
)
from ..rules import PIECE_COMPLEXITE


def _fichier_upload(nom="piece.pdf", content_type="application/pdf", contenu=b"%PDF-1.4 contenu factice"):
    return SimpleUploadedFile(nom, contenu, content_type=content_type)


def _payload_fdr_valide(**overrides):
    """FDR JSON entièrement valide pour `POST /demandes/` — mêmes valeurs de
    référence que `_valeurs_fdr_complet` (test_envoi.py), en JSON natif
    (dates/décimaux en chaînes) puisqu'envoyé via `format="json"`."""
    valeurs = dict(
        assure_nom="AXA Construction",
        assure_ville="Paris",
        assure_numero_contrat="123456789",
        chantier_nom="Tour Horizon",
        chantier_ville="Lyon",
        type_chantier=TypeChantier.NEUVE,
        chantier_atypique=False,
        usage=Usage.BUREAU,
        date_debut="2026-01-10",
        date_fin="2026-06-30",
        montant_total="100000.00",
        intervention_description="Rénovation complète",
        intervention_montant_prestation="50000.00",
        intervention_type=TypeIntervention.PRINCIPALE,
        activite_couverte=True,
        travaux_standards=True,
    )
    valeurs.update(overrides)
    return valeurs


class DemandeModeleTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.distributeur = Utilisateur.objects.create_user(
            username="distributeur_modele", role=Role.DISTRIBUTEUR
        )

    def test_statut_invalide_rejete_par_la_base(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Demande.objects.create(
                    distributeur=self.distributeur, statut="INCONNU"
                )

    def test_suppression_du_proprietaire_protegee(self):
        demande = Demande.objects.create(distributeur=self.distributeur)

        with self.assertRaises(ProtectedError):
            self.distributeur.delete()

        self.assertTrue(Demande.objects.filter(pk=demande.pk).exists())
        self.assertTrue(
            Utilisateur.objects.filter(pk=self.distributeur.pk).exists()
        )


class DemandeEndpointTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.distributeur_a = Utilisateur.objects.create_user(
            username="distributeur_a", password="test1234", role=Role.DISTRIBUTEUR
        )
        cls.distributeur_b = Utilisateur.objects.create_user(
            username="distributeur_b", password="test1234", role=Role.DISTRIBUTEUR
        )
        cls.siege = Utilisateur.objects.create_user(
            username="siege_demandes", password="test1234", role=Role.SIEGE
        )
        cls.demande_a = Demande.objects.create(distributeur=cls.distributeur_a)
        cls.demande_b = Demande.objects.create(distributeur=cls.distributeur_b)

    def _authentifier(self, utilisateur):
        response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": utilisateur.username, "password": "test1234"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {response.data['access']}"
        )

    def test_distributeur_cree_un_brouillon_avec_fdr_complet(self):
        self._authentifier(self.distributeur_a)
        nombre_avant = Demande.objects.count()

        response = self.client.post(
            reverse("demande-list"), {"fdr": _payload_fdr_valide()}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Demande.objects.count(), nombre_avant + 1)
        demande = Demande.objects.get(pk=response.data["id"])
        self.assertIsInstance(demande.pk, uuid.UUID)
        self.assertEqual(demande.pk.version, 4)
        self.assertEqual(demande.distributeur, self.distributeur_a)
        self.assertEqual(demande.statut, StatutDemande.BROUILLON)
        self.assertEqual(response.data["distributeur"], self.distributeur_a.pk)
        self.assertEqual(response.data["statut"], StatutDemande.BROUILLON)
        self.assertEqual(response.data["fdr"]["assure_nom"], "AXA Construction")
        self.assertEqual(demande.fdr.assure_nom, "AXA Construction")
        self.assertIsNotNone(demande.created_at)
        self.assertIsNotNone(demande.updated_at)

    def test_payload_ne_peut_imposer_proprietaire_ni_statut(self):
        self._authentifier(self.distributeur_a)
        payloads = [
            {"fdr": _payload_fdr_valide(), "distributeur": self.distributeur_b.pk},
            {"fdr": _payload_fdr_valide(), "statut": StatutDemande.EN_COURS},
            {
                "fdr": _payload_fdr_valide(),
                "distributeur": self.siege.pk,
                "statut": StatutDemande.TRAITE,
            },
        ]

        for payload in payloads:
            with self.subTest(payload=payload):
                response = self.client.post(
                    reverse("demande-list"), payload, format="json"
                )

                self.assertEqual(response.status_code, status.HTTP_201_CREATED)
                demande = Demande.objects.get(pk=response.data["id"])
                self.assertEqual(demande.distributeur, self.distributeur_a)
                self.assertEqual(demande.statut, StatutDemande.BROUILLON)
                self.assertEqual(
                    response.data["distributeur"], self.distributeur_a.pk
                )
                self.assertEqual(response.data["statut"], StatutDemande.BROUILLON)

    def test_creation_sans_fdr_refuse_400_sans_rien_creer(self):
        self._authentifier(self.distributeur_a)
        nombre_demandes_avant = Demande.objects.count()
        nombre_fdr_avant = FormulaireRisque.objects.count()

        response = self.client.post(reverse("demande-list"), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "FDR_INVALIDE")
        self.assertIn("assure_nom", response.data["erreurs"])
        self.assertEqual(Demande.objects.count(), nombre_demandes_avant)
        self.assertEqual(FormulaireRisque.objects.count(), nombre_fdr_avant)

    def test_creation_avec_fdr_incomplet_refuse_400_sans_rien_creer(self):
        self._authentifier(self.distributeur_a)
        nombre_demandes_avant = Demande.objects.count()
        nombre_fdr_avant = FormulaireRisque.objects.count()
        payload = _payload_fdr_valide()
        del payload["assure_nom"]

        response = self.client.post(
            reverse("demande-list"), {"fdr": payload}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "FDR_INVALIDE")
        self.assertIn("assure_nom", response.data["erreurs"])
        self.assertEqual(Demande.objects.count(), nombre_demandes_avant)
        self.assertEqual(FormulaireRisque.objects.count(), nombre_fdr_avant)

    def test_creation_avec_incoherence_croisee_refuse_400_sans_rien_creer(self):
        self._authentifier(self.distributeur_a)
        nombre_demandes_avant = Demande.objects.count()
        payload = _payload_fdr_valide(
            montant_total="1000.00", intervention_montant_prestation="1000.00"
        )

        response = self.client.post(
            reverse("demande-list"), {"fdr": payload}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "FDR_INVALIDE")
        self.assertIn("intervention_montant_prestation", response.data["erreurs"])
        self.assertEqual(Demande.objects.count(), nombre_demandes_avant)

    def test_creation_ne_requiert_aucune_piece_justificative(self):
        self._authentifier(self.distributeur_a)

        response = self.client.post(
            reverse("demande-list"),
            {"fdr": _payload_fdr_valide(chantier_atypique=True)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_liste_limitee_aux_demandes_du_distributeur_connecte(self):
        autre_demande_a = Demande.objects.create(
            distributeur=self.distributeur_a, statut=StatutDemande.EN_COURS
        )
        self._authentifier(self.distributeur_a)

        response = self.client.get(reverse("demande-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        resultats = response.data["results"]
        self.assertCountEqual(
            [demande["id"] for demande in resultats],
            [str(self.demande_a.pk), str(autre_demande_a.pk)],
        )
        self.assertTrue(
            all(
                demande["distributeur"] == self.distributeur_a.pk
                for demande in resultats
            )
        )
        self.assertTrue(all("fdr" not in demande for demande in resultats))

    def test_liste_vide_si_aucune_demande_personnelle(self):
        self.demande_a.delete()
        self._authentifier(self.distributeur_a)

        response = self.client.get(reverse("demande-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])

    def test_liste_paginee_avec_count_next_previous_results(self):
        Demande.objects.filter(distributeur=self.distributeur_a).delete()
        for _ in range(15):
            Demande.objects.create(distributeur=self.distributeur_a)
        self._authentifier(self.distributeur_a)

        premiere_page = self.client.get(reverse("demande-list"))
        deuxieme_page = self.client.get(reverse("demande-list"), {"page": 2})

        self.assertEqual(premiere_page.status_code, status.HTTP_200_OK)
        self.assertEqual(premiere_page.data["count"], 15)
        self.assertEqual(len(premiere_page.data["results"]), 10)
        self.assertIsNotNone(premiere_page.data["next"])
        self.assertIsNone(premiere_page.data["previous"])

        self.assertEqual(deuxieme_page.status_code, status.HTTP_200_OK)
        self.assertEqual(len(deuxieme_page.data["results"]), 5)
        self.assertIsNone(deuxieme_page.data["next"])
        self.assertIsNotNone(deuxieme_page.data["previous"])

    def test_page_hors_bornes_retourne_404(self):
        self._authentifier(self.distributeur_a)

        response = self.client.get(reverse("demande-list"), {"page": 999})

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_filtre_statut_ne_retourne_que_les_demandes_correspondantes(self):
        Demande.objects.create(distributeur=self.distributeur_a, statut=StatutDemande.EN_COURS)
        Demande.objects.create(distributeur=self.distributeur_a, statut=StatutDemande.TRAITE)
        self._authentifier(self.distributeur_a)

        for statut in StatutDemande.values:
            with self.subTest(statut=statut):
                response = self.client.get(reverse("demande-list"), {"statut": statut})
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertTrue(
                    all(demande["statut"] == statut for demande in response.data["results"])
                )

    def test_filtre_statut_invalide_retourne_400(self):
        self._authentifier(self.distributeur_a)

        response = self.client.get(reverse("demande-list"), {"statut": "INCONNU"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_filtre_decision_et_combinaison_avec_statut(self):
        acceptee = Demande.objects.create(
            distributeur=self.distributeur_a, statut=StatutDemande.TRAITE, decision=DecisionDemande.ACCEPTEE
        )
        refusee = Demande.objects.create(
            distributeur=self.distributeur_a, statut=StatutDemande.TRAITE, decision=DecisionDemande.REFUSEE
        )
        en_cours = Demande.objects.create(distributeur=self.distributeur_a, statut=StatutDemande.EN_COURS)
        Demande.objects.create(
            distributeur=self.distributeur_b, statut=StatutDemande.TRAITE, decision=DecisionDemande.ACCEPTEE
        )
        self._authentifier(self.distributeur_a)

        def ids(**filtres):
            response = self.client.get(reverse("demande-list"), filtres)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            return {demande["id"] for demande in response.data["results"]}

        self.assertEqual(ids(decision="ACCEPTEE"), {str(acceptee.id)})
        self.assertEqual(ids(decision="REFUSEE"), {str(refusee.id)})
        brouillon = Demande.objects.create(distributeur=self.distributeur_a, statut=StatutDemande.BROUILLON)
        self.assertEqual(ids(decision="EN_ATTENTE"), {str(en_cours.id)})
        self.assertNotIn(str(brouillon.id), ids(decision="EN_ATTENTE"))
        self.assertEqual(ids(statut="BROUILLON", decision="EN_ATTENTE"), set())
        self.assertEqual(ids(statut="TRAITE", decision="ACCEPTEE"), {str(acceptee.id)})
        self.assertEqual(ids(statut="EN_COURS", decision="ACCEPTEE"), set())
        self.assertEqual(ids(statut="EN_COURS", decision="EN_ATTENTE"), {str(en_cours.id)})

    def test_filtre_complements_et_combinaison(self):
        avec = Demande.objects.create(distributeur=self.distributeur_a, statut=StatutDemande.EN_COURS)
        DemandeComplement.objects.create(demande=avec, message="Premier")
        DemandeComplement.objects.create(demande=avec, message="Second", received_at=timezone.now())
        sans = Demande.objects.create(distributeur=self.distributeur_a, statut=StatutDemande.EN_COURS)
        traitee = Demande.objects.create(
            distributeur=self.distributeur_a, statut=StatutDemande.TRAITE, decision=DecisionDemande.ACCEPTEE
        )
        DemandeComplement.objects.create(demande=traitee, message="Ancien", received_at=timezone.now())
        autre = Demande.objects.create(distributeur=self.distributeur_b, statut=StatutDemande.EN_COURS)
        DemandeComplement.objects.create(demande=autre, message="Autre distributeur")
        self._authentifier(self.distributeur_a)

        def liste(**filtres):
            response = self.client.get(reverse("demande-list"), filtres)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            return [demande["id"] for demande in response.data["results"]]

        self.assertCountEqual(liste(complements="DEMANDES"), [str(avec.id), str(traitee.id)])
        aucun = liste(complements="AUCUN")
        self.assertIn(str(sans.id), aucun)
        self.assertNotIn(str(avec.id), aucun)
        self.assertNotIn(str(traitee.id), aucun)
        self.assertNotIn(str(autre.id), aucun)
        self.assertEqual(liste(statut="EN_COURS", decision="EN_ATTENTE", complements="DEMANDES"), [str(avec.id)])
        self.assertEqual(liste(statut="TRAITE", decision="ACCEPTEE", complements="DEMANDES"), [str(traitee.id)])
        self.assertEqual(liste(statut="TRAITE", complements="AUCUN"), [])

    def test_filtre_complements_invalide_retourne_400(self):
        self._authentifier(self.distributeur_a)

        response = self.client.get(reverse("demande-list"), {"complements": "TOUS"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_liste_expose_assure_et_chantier_sans_requete_par_ligne(self):
        for indice in range(4):
            demande = Demande.objects.create(distributeur=self.distributeur_a, statut=StatutDemande.BROUILLON)
            FormulaireRisque.objects.create(
                demande=demande, assure_nom=f"Assuré {indice}", chantier_nom=f"Chantier {indice}"
            )
        Demande.objects.create(distributeur=self.distributeur_a, statut=StatutDemande.BROUILLON)
        self._authentifier(self.distributeur_a)

        with CaptureQueriesContext(connection) as requetes:
            resultats = self.client.get(reverse("demande-list")).data["results"]

        noms = {(d["assure_nom"], d["chantier_nom"]) for d in resultats}
        self.assertIn(("Assuré 2", "Chantier 2"), noms)
        self.assertIn(("", ""), noms)
        self.assertLessEqual(len(requetes), 6)

    def test_filtre_decision_invalide_retourne_400(self):
        self._authentifier(self.distributeur_a)

        response = self.client.get(reverse("demande-list"), {"decision": "INCONNUE"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_liste_expose_decision_et_attestation_finale(self):
        demande = Demande.objects.create(
            distributeur=self.distributeur_a, statut=StatutDemande.TRAITE, decision=DecisionDemande.ACCEPTEE
        )
        Attestation.objects.create(demande=demande, pdf_final="attestations/x.pdf", validated_at=timezone.now())
        Demande.objects.create(
            distributeur=self.distributeur_a, statut=StatutDemande.TRAITE, decision=DecisionDemande.REFUSEE
        )
        self._authentifier(self.distributeur_a)

        resultats = {d["decision"]: d for d in self.client.get(reverse("demande-list")).data["results"]}

        self.assertIsNotNone(resultats["ACCEPTEE"]["attestation_finale"]["validated_at"])
        self.assertIsNone(resultats["REFUSEE"]["attestation_finale"])

    def test_filtre_statut_vide_equivaut_a_aucun_filtre(self):
        self._authentifier(self.distributeur_a)

        avec_statut_vide = self.client.get(reverse("demande-list"), {"statut": ""})
        sans_filtre = self.client.get(reverse("demande-list"))

        self.assertEqual(avec_statut_vide.status_code, status.HTTP_200_OK)
        self.assertEqual(avec_statut_vide.data["count"], sans_filtre.data["count"])

    def test_filtre_statut_respecte_ownership(self):
        Demande.objects.create(distributeur=self.distributeur_b, statut=StatutDemande.BROUILLON)
        self._authentifier(self.distributeur_a)

        response = self.client.get(reverse("demande-list"), {"statut": StatutDemande.BROUILLON})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            all(demande["distributeur"] == self.distributeur_a.pk for demande in response.data["results"])
        )

    def test_filtre_statut_combine_a_la_pagination(self):
        Demande.objects.filter(distributeur=self.distributeur_a).delete()
        for _ in range(15):
            Demande.objects.create(distributeur=self.distributeur_a, statut=StatutDemande.BROUILLON)
        Demande.objects.create(distributeur=self.distributeur_a, statut=StatutDemande.EN_COURS)
        self._authentifier(self.distributeur_a)

        premiere_page = self.client.get(
            reverse("demande-list"), {"statut": StatutDemande.BROUILLON, "page": 1}
        )
        deuxieme_page = self.client.get(
            reverse("demande-list"), {"statut": StatutDemande.BROUILLON, "page": 2}
        )

        self.assertEqual(premiere_page.data["count"], 15)
        self.assertEqual(len(premiere_page.data["results"]), 10)
        self.assertEqual(len(deuxieme_page.data["results"]), 5)
        self.assertTrue(
            all(
                demande["statut"] == StatutDemande.BROUILLON
                for demande in premiere_page.data["results"] + deuxieme_page.data["results"]
            )
        )

    def test_ordre_stable_a_travers_les_pages(self):
        Demande.objects.filter(distributeur=self.distributeur_a).delete()
        demandes = [Demande.objects.create(distributeur=self.distributeur_a) for _ in range(15)]
        ordre_attendu = [
            str(demande.pk)
            for demande in sorted(demandes, key=lambda d: (d.created_at, d.pk), reverse=True)
        ]
        self._authentifier(self.distributeur_a)

        premiere_page = self.client.get(reverse("demande-list"), {"page": 1})
        deuxieme_page = self.client.get(reverse("demande-list"), {"page": 2})

        ids_retournes = [demande["id"] for demande in premiere_page.data["results"]] + [
            demande["id"] for demande in deuxieme_page.data["results"]
        ]
        self.assertEqual(ids_retournes, ordre_attendu)

    def test_distributeur_consulte_sa_demande(self):
        self._authentifier(self.distributeur_a)

        response = self.client.get(
            reverse("demande-detail", kwargs={"pk": self.demande_a.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], str(self.demande_a.pk))
        self.assertEqual(response.data["distributeur"], self.distributeur_a.pk)
        self.assertEqual(response.data["statut"], StatutDemande.BROUILLON)

    def test_demande_autre_distributeur_retourne_404_sans_reveler_existence(self):
        self._authentifier(self.distributeur_a)

        response = self.client.get(
            reverse("demande-detail", kwargs={"pk": self.demande_b.pk})
        )
        response_inexistante = self.client.get(
            reverse("demande-detail", kwargs={"pk": uuid.uuid4()})
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            response_inexistante.status_code, status.HTTP_404_NOT_FOUND
        )
        self.assertEqual(response.data, response_inexistante.data)

    def test_uuid_inexistant_retourne_404(self):
        self._authentifier(self.distributeur_a)

        response = self.client.get(
            reverse("demande-detail", kwargs={"pk": uuid.uuid4()})
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_identifiant_malforme_retourne_404(self):
        self._authentifier(self.distributeur_a)

        response = self.client.get("/api/demandes/pas-un-uuid/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_siege_recoit_403_sur_creation_liste_et_detail(self):
        self._authentifier(self.siege)
        nombre_avant = Demande.objects.count()
        endpoints = [
            ("post", reverse("demande-list")),
            ("get", reverse("demande-list")),
            ("get", reverse("demande-detail", kwargs={"pk": self.demande_a.pk})),
        ]

        for methode, url in endpoints:
            with self.subTest(methode=methode, url=url):
                response = getattr(self.client, methode)(url, format="json")
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.assertEqual(Demande.objects.count(), nombre_avant)

    def test_anonyme_recoit_401_sur_creation_liste_et_detail(self):
        nombre_avant = Demande.objects.count()
        endpoints = [
            ("post", reverse("demande-list")),
            ("get", reverse("demande-list")),
            ("get", reverse("demande-detail", kwargs={"pk": self.demande_a.pk})),
        ]

        for methode, url in endpoints:
            with self.subTest(methode=methode, url=url):
                response = getattr(self.client, methode)(url, format="json")
                self.assertEqual(
                    response.status_code, status.HTTP_401_UNAUTHORIZED
                )

        self.assertEqual(Demande.objects.count(), nombre_avant)

    def test_modification_non_exposee(self):
        self._authentifier(self.distributeur_a)
        url = reverse("demande-detail", kwargs={"pk": self.demande_a.pk})

        for methode in ("patch", "put"):
            with self.subTest(methode=methode):
                response = getattr(self.client, methode)(
                    url, {"statut": StatutDemande.TRAITE}, format="json"
                )
                self.assertEqual(
                    response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED
                )

        self.demande_a.refresh_from_db()
        self.assertEqual(self.demande_a.statut, StatutDemande.BROUILLON)
        self.assertEqual(self.demande_a.distributeur, self.distributeur_a)


class DemandeSuppressionEndpointTests(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._media_root_tmp = tempfile.mkdtemp(prefix="suppression_tests_")
        cls._override_media_root = override_settings(MEDIA_ROOT=cls._media_root_tmp)
        cls._override_media_root.enable()

    @classmethod
    def tearDownClass(cls):
        cls._override_media_root.disable()
        shutil.rmtree(cls._media_root_tmp, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.distributeur_a = Utilisateur.objects.create_user(
            username="distributeur_suppr_a", password="test1234", role=Role.DISTRIBUTEUR
        )
        self.distributeur_b = Utilisateur.objects.create_user(
            username="distributeur_suppr_b", password="test1234", role=Role.DISTRIBUTEUR
        )
        self.siege = Utilisateur.objects.create_user(
            username="siege_suppr", password="test1234", role=Role.SIEGE
        )

    def _authentifier(self, utilisateur):
        response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": utilisateur.username, "password": "test1234"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _url(self, demande):
        return reverse("demande-detail", kwargs={"pk": demande.pk})

    def test_suppression_brouillon_proprietaire_retourne_204_et_supprime_tout(self):
        demande = Demande.objects.create(distributeur=self.distributeur_a)
        fdr = FormulaireRisque.objects.create(demande=demande)
        piece = PieceJustificative.objects.create(
            demande=demande,
            type_piece=PIECE_COMPLEXITE,
            fichier=_fichier_upload(),
            nom_fichier_original="piece.pdf",
        )
        chemin_fichier = piece.fichier.path
        self.assertTrue(piece.fichier.storage.exists(piece.fichier.name))
        self._authentifier(self.distributeur_a)

        response = self.client.delete(self._url(demande))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Demande.objects.filter(pk=demande.pk).exists())
        self.assertFalse(FormulaireRisque.objects.filter(pk=fdr.pk).exists())
        self.assertFalse(PieceJustificative.objects.filter(pk=piece.pk).exists())
        self.assertFalse(Path(chemin_fichier).exists())

    def test_suppression_nettoie_un_fdr_pdf_anormalement_present_sur_un_brouillon(self):
        demande = Demande.objects.create(distributeur=self.distributeur_a)
        FormulaireRisque.objects.create(demande=demande)
        demande.fdr_pdf.save("brouillon.pdf", ContentFile(b"%PDF-1.4 contenu"), save=True)
        chemin_pdf = demande.fdr_pdf.path
        self._authentifier(self.distributeur_a)

        response = self.client.delete(self._url(demande))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Path(chemin_pdf).exists())

    def test_suppression_en_cours_refuse_409(self):
        demande = Demande.objects.create(distributeur=self.distributeur_a, statut=StatutDemande.EN_COURS)
        self._authentifier(self.distributeur_a)

        response = self.client.delete(self._url(demande))

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(Demande.objects.filter(pk=demande.pk).exists())

    def test_suppression_traite_refuse_409(self):
        demande = Demande.objects.create(distributeur=self.distributeur_a, statut=StatutDemande.TRAITE)
        self._authentifier(self.distributeur_a)

        response = self.client.delete(self._url(demande))

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(Demande.objects.filter(pk=demande.pk).exists())

    def test_suppression_autre_distributeur_retourne_404(self):
        demande = Demande.objects.create(distributeur=self.distributeur_b)
        self._authentifier(self.distributeur_a)

        response = self.client.delete(self._url(demande))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Demande.objects.filter(pk=demande.pk).exists())

    def test_suppression_siege_retourne_403(self):
        demande = Demande.objects.create(distributeur=self.distributeur_a)
        self._authentifier(self.siege)

        response = self.client.delete(self._url(demande))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Demande.objects.filter(pk=demande.pk).exists())

    def test_suppression_anonyme_retourne_401(self):
        demande = Demande.objects.create(distributeur=self.distributeur_a)

        response = self.client.delete(self._url(demande))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertTrue(Demande.objects.filter(pk=demande.pk).exists())
