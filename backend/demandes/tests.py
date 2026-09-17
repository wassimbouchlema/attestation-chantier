import shutil
import tempfile
import uuid
from decimal import Decimal
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur

from .models import Demande, FormulaireRisque, PieceJustificative, StatutDemande, TypeChantier, Usage
from .rules import (
    PIECE_ACTIVITE,
    PIECE_COMPLEXITE,
    PIECE_MONTANT,
    PIECE_STRUCTURE,
    PIECE_TRAVAUX,
    PIECE_USAGE,
    calculer_pieces_requises,
)


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

    def test_distributeur_cree_un_brouillon_dont_il_est_proprietaire(self):
        self._authentifier(self.distributeur_a)
        nombre_avant = Demande.objects.count()

        response = self.client.post(reverse("demande-list"), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Demande.objects.count(), nombre_avant + 1)
        demande = Demande.objects.get(pk=response.data["id"])
        self.assertIsInstance(demande.pk, uuid.UUID)
        self.assertEqual(demande.pk.version, 4)
        self.assertEqual(demande.distributeur, self.distributeur_a)
        self.assertEqual(demande.statut, StatutDemande.BROUILLON)
        self.assertEqual(response.data["distributeur"], self.distributeur_a.pk)
        self.assertEqual(response.data["statut"], StatutDemande.BROUILLON)
        self.assertIsNotNone(demande.created_at)
        self.assertIsNotNone(demande.updated_at)

    def test_payload_ne_peut_imposer_proprietaire_ni_statut(self):
        self._authentifier(self.distributeur_a)
        payloads = [
            {"distributeur": self.distributeur_b.pk},
            {"statut": StatutDemande.EN_COURS},
            {"distributeur": self.siege.pk, "statut": StatutDemande.TRAITE},
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

    def test_modification_et_suppression_non_exposees(self):
        self._authentifier(self.distributeur_a)
        url = reverse("demande-detail", kwargs={"pk": self.demande_a.pk})

        for methode in ("patch", "put", "delete"):
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


def _fichier_upload(nom="piece.pdf", content_type="application/pdf", contenu=b"%PDF-1.4 contenu factice"):
    return SimpleUploadedFile(nom, contenu, content_type=content_type)


class PieceJustificativeEndpointTests(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # MEDIA_ROOT temporaire dédié à cette classe de tests : les fichiers
        # uploadés pendant les tests n'atterrissent jamais dans le vrai media/
        # du repo. Géré manuellement (plutôt qu'en décorateur de classe) pour
        # être certain de nettoyer le bon dossier dans tearDownClass.
        cls._media_root_tmp = tempfile.mkdtemp(prefix="pieces_tests_")
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
            username="distributeur_pieces_a", password="test1234", role=Role.DISTRIBUTEUR
        )
        cls.distributeur_b = Utilisateur.objects.create_user(
            username="distributeur_pieces_b", password="test1234", role=Role.DISTRIBUTEUR
        )
        cls.siege = Utilisateur.objects.create_user(
            username="siege_pieces", password="test1234", role=Role.SIEGE
        )
        cls.demande = Demande.objects.create(distributeur=cls.distributeur_a)
        cls.fdr = FormulaireRisque.objects.create(demande=cls.demande)

    def _authentifier(self, utilisateur):
        response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": utilisateur.username, "password": "test1234"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _url_pieces(self, demande):
        return reverse("piece-list", kwargs={"demande_id": demande.pk})

    def _url_piece_detail(self, demande, piece):
        return reverse("piece-detail", kwargs={"demande_id": demande.pk, "pk": piece.pk})

    def test_get_sans_piece_calcule_correctement_les_requises_et_manquantes(self):
        self.fdr.chantier_atypique = True
        self.fdr.activite_couverte = False
        self.fdr.save(update_fields=["chantier_atypique", "activite_couverte"])
        self._authentifier(self.distributeur_a)

        response = self.client.get(self._url_pieces(self.demande))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["pieces"], [])
        self.assertEqual(response.data["pieces_requises"], [PIECE_COMPLEXITE, PIECE_ACTIVITE])
        self.assertEqual(response.data["pieces_manquantes"], [PIECE_COMPLEXITE, PIECE_ACTIVITE])
        self.assertFalse(response.data["dossier_complet"])

    def test_post_multipart_cree_la_piece_liee_a_la_bonne_demande(self):
        self._authentifier(self.distributeur_a)

        response = self.client.post(
            self._url_pieces(self.demande),
            {"type_piece": PIECE_ACTIVITE, "fichier": _fichier_upload()},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        piece = PieceJustificative.objects.get(pk=response.data["id"])
        self.assertEqual(piece.demande, self.demande)
        self.assertEqual(piece.type_piece, PIECE_ACTIVITE)
        self.assertEqual(piece.nom_fichier_original, "piece.pdf")

    def test_get_apres_upload_liste_la_piece_et_seules_les_autres_categories_restent_manquantes(self):
        self.fdr.chantier_atypique = True
        self.fdr.activite_couverte = False
        self.fdr.save(update_fields=["chantier_atypique", "activite_couverte"])
        self._authentifier(self.distributeur_a)
        self.client.post(
            self._url_pieces(self.demande),
            {"type_piece": PIECE_ACTIVITE, "fichier": _fichier_upload()},
            format="multipart",
        )

        response = self.client.get(self._url_pieces(self.demande))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["pieces"]), 1)
        self.assertEqual(response.data["pieces"][0]["type_piece"], PIECE_ACTIVITE)
        self.assertEqual(response.data["pieces_requises"], [PIECE_COMPLEXITE, PIECE_ACTIVITE])
        self.assertEqual(response.data["pieces_manquantes"], [PIECE_COMPLEXITE])
        self.assertFalse(response.data["dossier_complet"])

    def test_toutes_les_categories_requises_presentes_dossier_complet(self):
        self.fdr.chantier_atypique = True
        self.fdr.activite_couverte = False
        self.fdr.save(update_fields=["chantier_atypique", "activite_couverte"])
        self._authentifier(self.distributeur_a)
        for type_piece in (PIECE_COMPLEXITE, PIECE_ACTIVITE):
            self.client.post(
                self._url_pieces(self.demande),
                {"type_piece": type_piece, "fichier": _fichier_upload()},
                format="multipart",
            )

        response = self.client.get(self._url_pieces(self.demande))

        self.assertEqual(response.data["pieces_manquantes"], [])
        self.assertTrue(response.data["dossier_complet"])

    def test_aucune_categorie_requise_dossier_complet_sans_upload(self):
        self._authentifier(self.distributeur_a)

        response = self.client.get(self._url_pieces(self.demande))

        self.assertEqual(response.data["pieces_requises"], [])
        self.assertEqual(response.data["pieces_manquantes"], [])
        self.assertTrue(response.data["dossier_complet"])

    def test_plusieurs_fichiers_meme_type_categorie_reste_simplement_satisfaite(self):
        self.fdr.usage = Usage.AUTRE
        self.fdr.usage_autre_texte = "Local technique"
        self.fdr.save(update_fields=["usage", "usage_autre_texte"])
        self._authentifier(self.distributeur_a)
        for nom in ("piece1.pdf", "piece2.pdf"):
            self.client.post(
                self._url_pieces(self.demande),
                {"type_piece": PIECE_USAGE, "fichier": _fichier_upload(nom=nom)},
                format="multipart",
            )

        response = self.client.get(self._url_pieces(self.demande))

        self.assertEqual(len(response.data["pieces"]), 2)
        self.assertEqual(response.data["pieces_manquantes"], [])
        self.assertTrue(response.data["dossier_complet"])

    def test_delete_supprime_la_piece_et_le_fichier_physique_puis_recalcule_au_get_suivant(self):
        self.fdr.activite_couverte = False
        self.fdr.save(update_fields=["activite_couverte"])
        self._authentifier(self.distributeur_a)
        creation = self.client.post(
            self._url_pieces(self.demande),
            {"type_piece": PIECE_ACTIVITE, "fichier": _fichier_upload()},
            format="multipart",
        )
        piece = PieceJustificative.objects.get(pk=creation.data["id"])
        chemin_fichier = piece.fichier.path
        self.assertTrue(Path(chemin_fichier).exists())

        response = self.client.delete(self._url_piece_detail(self.demande, piece))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(PieceJustificative.objects.filter(pk=piece.pk).exists())
        self.assertFalse(Path(chemin_fichier).exists())

        verification = self.client.get(self._url_pieces(self.demande))
        self.assertEqual(verification.data["pieces_manquantes"], [PIECE_ACTIVITE])
        self.assertFalse(verification.data["dossier_complet"])

    def test_post_hors_brouillon_refuse_409(self):
        self.demande.statut = StatutDemande.EN_COURS
        self.demande.save(update_fields=["statut"])
        self._authentifier(self.distributeur_a)

        response = self.client.post(
            self._url_pieces(self.demande),
            {"type_piece": PIECE_ACTIVITE, "fichier": _fichier_upload()},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(PieceJustificative.objects.filter(demande=self.demande).count(), 0)

    def test_delete_hors_brouillon_refuse_409(self):
        self._authentifier(self.distributeur_a)
        creation = self.client.post(
            self._url_pieces(self.demande),
            {"type_piece": PIECE_ACTIVITE, "fichier": _fichier_upload()},
            format="multipart",
        )
        piece = PieceJustificative.objects.get(pk=creation.data["id"])
        self.demande.statut = StatutDemande.EN_COURS
        self.demande.save(update_fields=["statut"])

        response = self.client.delete(self._url_piece_detail(self.demande, piece))

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(PieceJustificative.objects.filter(pk=piece.pk).exists())

    def test_get_reste_autorise_hors_brouillon(self):
        self.demande.statut = StatutDemande.EN_COURS
        self.demande.save(update_fields=["statut"])
        self._authentifier(self.distributeur_a)

        response = self.client.get(self._url_pieces(self.demande))

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_autre_distributeur_ne_peut_ni_lister_ni_uploader_ni_supprimer(self):
        self._authentifier(self.distributeur_a)
        creation = self.client.post(
            self._url_pieces(self.demande),
            {"type_piece": PIECE_ACTIVITE, "fichier": _fichier_upload()},
            format="multipart",
        )
        piece = PieceJustificative.objects.get(pk=creation.data["id"])

        self._authentifier(self.distributeur_b)

        self.assertEqual(
            self.client.get(self._url_pieces(self.demande)).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.post(
                self._url_pieces(self.demande),
                {"type_piece": PIECE_USAGE, "fichier": _fichier_upload()},
                format="multipart",
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.delete(self._url_piece_detail(self.demande, piece)).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_anonyme_recoit_401(self):
        self.assertEqual(
            self.client.get(self._url_pieces(self.demande)).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )
        self.assertEqual(
            self.client.post(self._url_pieces(self.demande), {}, format="multipart").status_code,
            status.HTTP_401_UNAUTHORIZED,
        )
        self.assertEqual(
            self.client.delete(
                reverse("piece-detail", kwargs={"demande_id": self.demande.pk, "pk": uuid.uuid4()})
            ).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_siege_recoit_403(self):
        self._authentifier(self.siege)

        self.assertEqual(
            self.client.get(self._url_pieces(self.demande)).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_suppression_piece_appartenant_a_une_autre_demande_impossible(self):
        autre_demande = Demande.objects.create(distributeur=self.distributeur_a)
        FormulaireRisque.objects.create(demande=autre_demande)
        self._authentifier(self.distributeur_a)
        creation = self.client.post(
            self._url_pieces(self.demande),
            {"type_piece": PIECE_ACTIVITE, "fichier": _fichier_upload()},
            format="multipart",
        )
        piece = PieceJustificative.objects.get(pk=creation.data["id"])

        response = self.client.delete(self._url_piece_detail(autre_demande, piece))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(PieceJustificative.objects.filter(pk=piece.pk).exists())

    def test_upload_type_fichier_non_autorise_rejete(self):
        self._authentifier(self.distributeur_a)

        response = self.client.post(
            self._url_pieces(self.demande),
            {
                "type_piece": PIECE_ACTIVITE,
                "fichier": _fichier_upload(
                    nom="notes.txt", content_type="text/plain", contenu=b"texte"
                ),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(PieceJustificative.objects.filter(demande=self.demande).count(), 0)

    def test_upload_categorie_inconnue_rejetee(self):
        self._authentifier(self.distributeur_a)

        response = self.client.post(
            self._url_pieces(self.demande),
            {"type_piece": "autre", "fichier": _fichier_upload()},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
