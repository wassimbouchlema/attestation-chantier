import uuid

from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur

from .models import Demande, FormulaireRisque, StatutDemande


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
        self.assertCountEqual(
            [demande["id"] for demande in response.data],
            [str(self.demande_a.pk), str(autre_demande_a.pk)],
        )
        self.assertTrue(
            all(
                demande["distributeur"] == self.distributeur_a.pk
                for demande in response.data
            )
        )
        self.assertTrue(all("fdr" not in demande for demande in response.data))

    def test_liste_vide_si_aucune_demande_personnelle(self):
        self.demande_a.delete()
        self._authentifier(self.distributeur_a)

        response = self.client.get(reverse("demande-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

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
