import uuid
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.test import SimpleTestCase, TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur

from ..models import Demande, FormulaireRisque, StatutDemande, TypeChantier, Usage
from ..rules import (
    PIECE_ACTIVITE,
    PIECE_COMPLEXITE,
    PIECE_MONTANT,
    PIECE_STRUCTURE,
    PIECE_TRAVAUX,
    PIECE_USAGE,
    calculer_pieces_requises,
)


class FormulaireRisqueAutoCreationTests(APITestCase):
    def test_creer_une_demande_cree_automatiquement_son_fdr_vide(self):
        distributeur = Utilisateur.objects.create_user(
            username="distributeur_auto_fdr", password="test1234", role=Role.DISTRIBUTEUR
        )
        token_response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": distributeur.username, "password": "test1234"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_response.data['access']}")

        response = self.client.post(reverse("demande-list"), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        demande = Demande.objects.get(pk=response.data["id"])
        self.assertTrue(FormulaireRisque.objects.filter(pk=demande.pk).exists())
        self.assertEqual(demande.fdr.assure_nom, "")
        self.assertIsNone(demande.fdr.chantier_atypique)


class FormulaireRisqueModeleTests(TestCase):
    def test_suppression_de_la_demande_supprime_le_fdr_en_cascade(self):
        distributeur = Utilisateur.objects.create_user(
            username="distributeur_cascade_fdr", role=Role.DISTRIBUTEUR
        )
        demande = Demande.objects.create(distributeur=distributeur)
        fdr = FormulaireRisque.objects.create(demande=demande)

        demande.delete()

        self.assertFalse(FormulaireRisque.objects.filter(pk=fdr.pk).exists())

    def test_enum_invalide_rejete_par_la_base(self):
        distributeur = Utilisateur.objects.create_user(
            username="distributeur_enum_db", role=Role.DISTRIBUTEUR
        )
        demande = Demande.objects.create(distributeur=distributeur)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                FormulaireRisque.objects.create(demande=demande, usage="INVALIDE")

    def test_fdr_vide_valide_en_base(self):
        distributeur = Utilisateur.objects.create_user(
            username="distributeur_fdr_vide", role=Role.DISTRIBUTEUR
        )
        demande = Demande.objects.create(distributeur=distributeur)

        fdr = FormulaireRisque.objects.create(demande=demande)

        self.assertEqual(fdr.usage, "")
        self.assertEqual(fdr.type_chantier, "")
        self.assertEqual(fdr.intervention_type, "")


class FormulaireRisqueEndpointTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.distributeur_a = Utilisateur.objects.create_user(
            username="distributeur_fdr_a", password="test1234", role=Role.DISTRIBUTEUR
        )
        cls.distributeur_b = Utilisateur.objects.create_user(
            username="distributeur_fdr_b", password="test1234", role=Role.DISTRIBUTEUR
        )
        cls.siege = Utilisateur.objects.create_user(
            username="siege_fdr", password="test1234", role=Role.SIEGE
        )
        cls.demande_a = Demande.objects.create(distributeur=cls.distributeur_a)
        cls.fdr_a = FormulaireRisque.objects.create(demande=cls.demande_a)
        cls.demande_b = Demande.objects.create(distributeur=cls.distributeur_b)
        FormulaireRisque.objects.create(demande=cls.demande_b)

    def _authentifier(self, utilisateur):
        response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": utilisateur.username, "password": "test1234"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _url_fdr(self, demande):
        return reverse("demande-fdr", kwargs={"pk": demande.pk})

    def test_get_fdr_par_le_proprietaire(self):
        self._authentifier(self.distributeur_a)

        response = self.client.get(self._url_fdr(self.demande_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["assure_nom"], "")
        self.assertIsNone(response.data["chantier_atypique"])

    def test_get_demande_detail_inclut_le_fdr_imbrique(self):
        self._authentifier(self.distributeur_a)

        response = self.client.get(reverse("demande-detail", kwargs={"pk": self.demande_a.pk}))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("fdr", response.data)
        self.assertEqual(response.data["fdr"]["assure_nom"], "")

    def test_patch_partiel_sauvegarde_uniquement_les_champs_envoyes(self):
        self._authentifier(self.distributeur_a)

        response = self.client.patch(
            self._url_fdr(self.demande_a), {"assure_nom": "Dupont SARL"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["assure_nom"], "Dupont SARL")
        self.assertEqual(response.data["chantier_nom"], "")
        self.assertIsNone(response.data["montant_total"])

    def test_deux_patch_successifs_cumulent_sans_ecraser(self):
        self._authentifier(self.distributeur_a)

        self.client.patch(self._url_fdr(self.demande_a), {"assure_nom": "Dupont SARL"}, format="json")
        response = self.client.patch(
            self._url_fdr(self.demande_a), {"chantier_nom": "Chantier des Tilleuls"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["assure_nom"], "Dupont SARL")
        self.assertEqual(response.data["chantier_nom"], "Chantier des Tilleuls")

    def test_numero_contrat_valide_selon_le_format(self):
        self._authentifier(self.distributeur_a)
        cas = [
            ("12A3", status.HTTP_400_BAD_REQUEST),
            ("123456789012345", status.HTTP_400_BAD_REQUEST),
            ("", status.HTTP_200_OK),
            ("1234567890123", status.HTTP_200_OK),
        ]

        for valeur, code_attendu in cas:
            with self.subTest(valeur=valeur):
                response = self.client.patch(
                    self._url_fdr(self.demande_a), {"assure_numero_contrat": valeur}, format="json"
                )
                self.assertEqual(response.status_code, code_attendu)

    def test_montant_negatif_rejete_pour_montant_total_et_prestation(self):
        self._authentifier(self.distributeur_a)

        for champ in ["montant_total", "intervention_montant_prestation"]:
            with self.subTest(champ=champ):
                response = self.client.patch(self._url_fdr(self.demande_a), {champ: "-1"}, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_enum_invalide_rejete_pour_chaque_champ_choix(self):
        self._authentifier(self.distributeur_a)

        for champ in ["type_chantier", "usage", "intervention_type"]:
            with self.subTest(champ=champ):
                response = self.client.patch(self._url_fdr(self.demande_a), {champ: "INVALIDE"}, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_usage_autre_exige_une_precision(self):
        self._authentifier(self.distributeur_a)

        response = self.client.patch(self._url_fdr(self.demande_a), {"usage": "AUTRE"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.patch(
            self._url_fdr(self.demande_a),
            {"usage": "AUTRE", "usage_autre_texte": "Local associatif"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_usage_autre_valide_grace_au_texte_deja_persiste(self):
        self._authentifier(self.distributeur_a)
        premiere_reponse = self.client.patch(
            self._url_fdr(self.demande_a),
            {"usage_autre_texte": "Usage spécifique"},
            format="json",
        )
        self.assertEqual(premiere_reponse.status_code, status.HTTP_200_OK)

        response = self.client.patch(self._url_fdr(self.demande_a), {"usage": "AUTRE"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["usage"], "AUTRE")
        self.assertEqual(response.data["usage_autre_texte"], "Usage spécifique")

    def test_montant_prestation_rejete_a_cause_du_montant_total_deja_persiste(self):
        self._authentifier(self.distributeur_a)
        premiere_reponse = self.client.patch(
            self._url_fdr(self.demande_a), {"montant_total": "10000.00"}, format="json"
        )
        self.assertEqual(premiere_reponse.status_code, status.HTTP_200_OK)

        response = self.client.patch(
            self._url_fdr(self.demande_a),
            {"intervention_montant_prestation": "10000.00"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.fdr_a.refresh_from_db()
        self.assertIsNone(self.fdr_a.intervention_montant_prestation)

    def test_activite_non_couverte_exige_une_explication(self):
        self._authentifier(self.distributeur_a)

        response = self.client.patch(
            self._url_fdr(self.demande_a), {"activite_couverte": False}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.patch(
            self._url_fdr(self.demande_a),
            {"activite_couverte": False, "activite_non_couverte_texte": "Amiante non couvert"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_dates_incoherentes_rejetees_si_les_deux_sont_fournies(self):
        self._authentifier(self.distributeur_a)

        response = self.client.patch(
            self._url_fdr(self.demande_a),
            {"date_debut": "2026-06-01", "date_fin": "2026-06-01"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.patch(
            self._url_fdr(self.demande_a),
            {"date_debut": "2026-06-01", "date_fin": "2026-09-01"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_une_seule_date_fournie_ne_declenche_pas_la_regle(self):
        self._authentifier(self.distributeur_a)

        response = self.client.patch(
            self._url_fdr(self.demande_a), {"date_debut": "2026-06-01"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_montant_prestation_doit_rester_strictement_inferieur_au_montant_total(self):
        self._authentifier(self.distributeur_a)

        response = self.client.patch(
            self._url_fdr(self.demande_a),
            {"montant_total": "10000.00", "intervention_montant_prestation": "10000.00"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.patch(
            self._url_fdr(self.demande_a),
            {"montant_total": "10000.00", "intervention_montant_prestation": "9999.99"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_changement_de_type_chantier_hors_renovation_nettoie_modification_structure(self):
        self._authentifier(self.distributeur_a)
        self.client.patch(
            self._url_fdr(self.demande_a),
            {"type_chantier": "RENOVATION", "modification_structure": True},
            format="json",
        )

        response = self.client.patch(
            self._url_fdr(self.demande_a), {"type_chantier": "NEUVE"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["type_chantier"], "NEUVE")
        self.assertIsNone(response.data["modification_structure"])
        self.fdr_a.refresh_from_db()
        self.assertIsNone(self.fdr_a.modification_structure)

    def test_repondre_a_modification_structure_sans_renovation_est_neutralise(self):
        self._authentifier(self.distributeur_a)
        self.client.patch(self._url_fdr(self.demande_a), {"type_chantier": "NEUVE"}, format="json")

        response = self.client.patch(
            self._url_fdr(self.demande_a), {"modification_structure": True}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["modification_structure"])

    def test_modification_structure_conservee_quand_renovation(self):
        self._authentifier(self.distributeur_a)

        response = self.client.patch(
            self._url_fdr(self.demande_a),
            {"type_chantier": "RENOVATION", "modification_structure": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["modification_structure"])

    def test_distributeur_b_ne_peut_ni_lire_ni_modifier_le_fdr_de_a(self):
        self._authentifier(self.distributeur_b)
        url = self._url_fdr(self.demande_a)

        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            self.client.patch(url, {"assure_nom": "Intrus"}, format="json").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.fdr_a.refresh_from_db()
        self.assertEqual(self.fdr_a.assure_nom, "")

    def test_uuid_inexistant_sur_fdr_retourne_404(self):
        self._authentifier(self.distributeur_a)

        response = self.client.get(reverse("demande-fdr", kwargs={"pk": uuid.uuid4()}))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_siege_recoit_403_sur_fdr(self):
        self._authentifier(self.siege)
        url = self._url_fdr(self.demande_a)

        self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.patch(url, {}, format="json").status_code, status.HTTP_403_FORBIDDEN
        )

    def test_anonyme_recoit_401_sur_fdr(self):
        url = self._url_fdr(self.demande_a)

        self.assertEqual(self.client.get(url).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(
            self.client.patch(url, {}, format="json").status_code, status.HTTP_401_UNAUTHORIZED
        )

    def test_patch_fdr_hors_brouillon_retourne_409(self):
        self.demande_a.statut = StatutDemande.EN_COURS
        self.demande_a.save(update_fields=["statut"])
        self._authentifier(self.distributeur_a)

        response = self.client.patch(
            self._url_fdr(self.demande_a), {"assure_nom": "Test"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.fdr_a.refresh_from_db()
        self.assertEqual(self.fdr_a.assure_nom, "")

    def test_get_fdr_reste_autorise_hors_brouillon(self):
        self.demande_a.statut = StatutDemande.EN_COURS
        self.demande_a.save(update_fields=["statut"])
        self._authentifier(self.distributeur_a)

        response = self.client.get(self._url_fdr(self.demande_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)


class CalculerPiecesRequisesTests(SimpleTestCase):
    """Tests directs du moteur métier : instances FormulaireRisque en mémoire,
    jamais sauvegardées, aucun accès DB (SimpleTestCase)."""

    def test_fdr_vide_ne_declenche_aucune_piece(self):
        fdr = FormulaireRisque()

        self.assertEqual(calculer_pieces_requises(fdr), [])

    def test_renovation_avec_modification_structure_declenche_structure(self):
        fdr = FormulaireRisque(
            type_chantier=TypeChantier.RENOVATION, modification_structure=True
        )

        self.assertEqual(calculer_pieces_requises(fdr), [PIECE_STRUCTURE])

    def test_renovation_sans_modification_structure_ne_declenche_pas_structure(self):
        fdr = FormulaireRisque(
            type_chantier=TypeChantier.RENOVATION, modification_structure=False
        )

        self.assertEqual(calculer_pieces_requises(fdr), [])

    def test_hors_renovation_modification_structure_true_ne_declenche_pas_structure(self):
        fdr = FormulaireRisque(
            type_chantier=TypeChantier.NEUVE, modification_structure=True
        )

        self.assertEqual(calculer_pieces_requises(fdr), [])

    def test_usage_autre_declenche_usage(self):
        fdr = FormulaireRisque(usage=Usage.AUTRE)

        self.assertEqual(calculer_pieces_requises(fdr), [PIECE_USAGE])

    def test_chantier_atypique_declenche_complexite(self):
        fdr = FormulaireRisque(chantier_atypique=True)

        self.assertEqual(calculer_pieces_requises(fdr), [PIECE_COMPLEXITE])

    def test_montant_egal_au_seuil_ne_declenche_pas_montant(self):
        fdr = FormulaireRisque(montant_total=Decimal("10000000"))

        self.assertEqual(calculer_pieces_requises(fdr), [])

    def test_montant_juste_au_dessus_du_seuil_declenche_montant(self):
        fdr = FormulaireRisque(montant_total=Decimal("10000000.01"))

        self.assertEqual(calculer_pieces_requises(fdr), [PIECE_MONTANT])

    def test_activite_non_couverte_declenche_activite(self):
        fdr = FormulaireRisque(activite_couverte=False)

        self.assertEqual(calculer_pieces_requises(fdr), [PIECE_ACTIVITE])

    def test_activite_couverte_ne_declenche_pas_activite(self):
        fdr = FormulaireRisque(activite_couverte=True)

        self.assertEqual(calculer_pieces_requises(fdr), [])

    def test_travaux_non_standards_declenche_travaux(self):
        fdr = FormulaireRisque(travaux_standards=False)

        self.assertEqual(calculer_pieces_requises(fdr), [PIECE_TRAVAUX])

    def test_travaux_standards_ne_declenche_pas_travaux(self):
        fdr = FormulaireRisque(travaux_standards=True)

        self.assertEqual(calculer_pieces_requises(fdr), [])

    def test_booleens_null_ne_declenchent_aucune_piece_et_ne_plantent_pas(self):
        fdr = FormulaireRisque(
            modification_structure=None,
            chantier_atypique=None,
            activite_couverte=None,
            travaux_standards=None,
            montant_total=None,
        )

        self.assertEqual(calculer_pieces_requises(fdr), [])

    def test_plusieurs_regles_simultanees_toutes_pieces_dans_ordre_metier(self):
        fdr = FormulaireRisque(
            type_chantier=TypeChantier.RENOVATION,
            modification_structure=True,
            usage=Usage.AUTRE,
            chantier_atypique=True,
            montant_total=Decimal("10000000.01"),
            activite_couverte=False,
            travaux_standards=False,
        )

        self.assertEqual(
            calculer_pieces_requises(fdr),
            [
                PIECE_STRUCTURE,
                PIECE_USAGE,
                PIECE_COMPLEXITE,
                PIECE_MONTANT,
                PIECE_ACTIVITE,
                PIECE_TRAVAUX,
            ],
        )
