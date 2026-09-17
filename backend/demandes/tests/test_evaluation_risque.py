import shutil
import tempfile
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur

from ..evaluation_risque import (
    NIVEAU_ELEVE,
    NIVEAU_FAIBLE,
    NIVEAU_MODERE,
    POINTS_ACTIVITE,
    POINTS_COMPLEXITE,
    POINTS_MONTANT,
    POINTS_STRUCTURE,
    POINTS_TRAVAUX,
    POINTS_USAGE,
    calculer_evaluation_risque,
    determiner_niveau_risque,
)
from ..models import Demande, FormulaireRisque, TypeChantier, Usage
from ..rules import PIECE_COMPLEXITE


def _fichier_upload(nom="piece.pdf", content_type="application/pdf", contenu=b"%PDF-1.4 contenu factice"):
    return SimpleUploadedFile(nom, contenu, content_type=content_type)


class DeterminerNiveauRisqueTests(SimpleTestCase):
    def test_frontieres_exactes(self):
        cas = [
            (0, NIVEAU_FAIBLE),
            (24, NIVEAU_FAIBLE),
            (25, NIVEAU_MODERE),
            (49, NIVEAU_MODERE),
            (50, NIVEAU_ELEVE),
            (100, NIVEAU_ELEVE),
        ]
        for score, niveau_attendu in cas:
            with self.subTest(score=score):
                self.assertEqual(determiner_niveau_risque(score), niveau_attendu)


class CalculerEvaluationRisqueTests(SimpleTestCase):
    """Tests directs du moteur de scoring : instances FormulaireRisque en mémoire,
    jamais sauvegardées, aucun accès DB (SimpleTestCase). Volontairement indépendant
    de CalculerPiecesRequisesTests : les deux moteurs ne partagent aucun code."""

    def test_fdr_vide_score_zero_niveau_faible(self):
        fdr = FormulaireRisque()

        resultat = calculer_evaluation_risque(fdr)

        self.assertEqual(resultat["score"], 0)
        self.assertEqual(resultat["niveau"], NIVEAU_FAIBLE)

    def test_chaque_facteur_individuellement_ajoute_son_poids(self):
        cas = [
            (
                {"type_chantier": TypeChantier.RENOVATION, "modification_structure": True},
                POINTS_STRUCTURE,
            ),
            ({"usage": Usage.AUTRE}, POINTS_USAGE),
            ({"chantier_atypique": True}, POINTS_COMPLEXITE),
            ({"montant_total": Decimal("10000000.01")}, POINTS_MONTANT),
            ({"activite_couverte": False}, POINTS_ACTIVITE),
            ({"travaux_standards": False}, POINTS_TRAVAUX),
        ]
        for champs, poids_attendu in cas:
            with self.subTest(champs=champs):
                fdr = FormulaireRisque(**champs)
                self.assertEqual(calculer_evaluation_risque(fdr)["score"], poids_attendu)

    def test_hors_renovation_modification_structure_true_najoute_rien(self):
        fdr = FormulaireRisque(type_chantier=TypeChantier.NEUVE, modification_structure=True)

        self.assertEqual(calculer_evaluation_risque(fdr)["score"], 0)

    def test_montant_egal_au_seuil_najoute_rien(self):
        fdr = FormulaireRisque(montant_total=Decimal("10000000"))

        self.assertEqual(calculer_evaluation_risque(fdr)["score"], 0)

    def test_montant_juste_au_dessus_du_seuil_ajoute_le_poids(self):
        fdr = FormulaireRisque(montant_total=Decimal("10000000.01"))

        self.assertEqual(calculer_evaluation_risque(fdr)["score"], POINTS_MONTANT)

    def test_valeurs_nulles_aucune_erreur_score_zero(self):
        fdr = FormulaireRisque(
            modification_structure=None,
            chantier_atypique=None,
            activite_couverte=None,
            travaux_standards=None,
            montant_total=None,
        )

        resultat = calculer_evaluation_risque(fdr)

        self.assertEqual(resultat["score"], 0)
        self.assertEqual(resultat["niveau"], NIVEAU_FAIBLE)

    def test_combinaison_de_facteurs_somme_exacte(self):
        fdr = FormulaireRisque(
            chantier_atypique=True, activite_couverte=False, travaux_standards=False
        )

        resultat = calculer_evaluation_risque(fdr)

        self.assertEqual(
            resultat["score"], POINTS_COMPLEXITE + POINTS_ACTIVITE + POINTS_TRAVAUX
        )
        self.assertEqual(resultat["niveau"], NIVEAU_ELEVE)

    def test_tous_les_facteurs_score_100_niveau_eleve(self):
        fdr = FormulaireRisque(
            type_chantier=TypeChantier.RENOVATION,
            modification_structure=True,
            usage=Usage.AUTRE,
            chantier_atypique=True,
            montant_total=Decimal("10000000.01"),
            activite_couverte=False,
            travaux_standards=False,
        )

        resultat = calculer_evaluation_risque(fdr)

        self.assertEqual(resultat["score"], 100)
        self.assertEqual(resultat["niveau"], NIVEAU_ELEVE)

    def test_score_25_atteint_via_chantier_atypique_seul_est_modere(self):
        fdr = FormulaireRisque(chantier_atypique=True)

        resultat = calculer_evaluation_risque(fdr)

        self.assertEqual(resultat["score"], 25)
        self.assertEqual(resultat["niveau"], NIVEAU_MODERE)

    def test_score_50_atteint_est_eleve(self):
        fdr = FormulaireRisque(
            type_chantier=TypeChantier.RENOVATION,
            modification_structure=True,
            usage=Usage.AUTRE,
            montant_total=Decimal("10000000.01"),
        )

        resultat = calculer_evaluation_risque(fdr)

        self.assertEqual(resultat["score"], 50)
        self.assertEqual(resultat["niveau"], NIVEAU_ELEVE)


class EvaluationRisqueEndpointTests(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Même stratégie de MEDIA_ROOT temporaire que PieceJustificativeEndpointTests
        # (dupliquée volontairement : classes indépendantes, pas d'abstraction créée
        # pour ce seul besoin partagé).
        cls._media_root_tmp = tempfile.mkdtemp(prefix="evaluation_risque_tests_")
        cls._override_media_root = override_settings(MEDIA_ROOT=cls._media_root_tmp)
        cls._override_media_root.enable()

    @classmethod
    def tearDownClass(cls):
        cls._override_media_root.disable()
        shutil.rmtree(cls._media_root_tmp, ignore_errors=True)
        super().tearDownClass()

    @classmethod
    def setUpTestData(cls):
        cls.distributeur_a = Utilisateur.objects.create_user(
            username="distributeur_risque_a", password="test1234", role=Role.DISTRIBUTEUR
        )
        cls.distributeur_b = Utilisateur.objects.create_user(
            username="distributeur_risque_b", password="test1234", role=Role.DISTRIBUTEUR
        )
        cls.siege = Utilisateur.objects.create_user(
            username="siege_risque", password="test1234", role=Role.SIEGE
        )
        cls.demande = Demande.objects.create(distributeur=cls.distributeur_a)
        cls.fdr = FormulaireRisque.objects.create(demande=cls.demande, chantier_atypique=True)

    def _authentifier(self, utilisateur):
        response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": utilisateur.username, "password": "test1234"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _url_evaluation(self, demande):
        return reverse("demande-evaluation-risque", kwargs={"pk": demande.pk})

    def test_proprietaire_recoit_le_score_et_la_synthese(self):
        self._authentifier(self.distributeur_a)

        response = self.client.get(self._url_evaluation(self.demande))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["score"], 25)
        self.assertEqual(response.data["niveau"], NIVEAU_MODERE)
        self.assertIn("indicative", response.data["synthese"])

    def test_autre_distributeur_recoit_404(self):
        self._authentifier(self.distributeur_b)

        response = self.client.get(self._url_evaluation(self.demande))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_anonyme_recoit_401(self):
        response = self.client.get(self._url_evaluation(self.demande))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_siege_recoit_403(self):
        self._authentifier(self.siege)

        response = self.client.get(self._url_evaluation(self.demande))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_score_independant_des_pieces_et_de_la_completude(self):
        self._authentifier(self.distributeur_a)
        avant = self.client.get(self._url_evaluation(self.demande))

        creation = self.client.post(
            reverse("piece-list", kwargs={"demande_id": self.demande.pk}),
            {"type_piece": PIECE_COMPLEXITE, "fichier": _fichier_upload()},
            format="multipart",
        )
        self.assertEqual(creation.status_code, status.HTTP_201_CREATED)

        apres = self.client.get(self._url_evaluation(self.demande))

        self.assertEqual(avant.data["score"], apres.data["score"])
        self.assertEqual(avant.data["niveau"], apres.data["niveau"])
