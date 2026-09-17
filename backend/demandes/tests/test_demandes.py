import uuid

from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur

from ..models import Demande, StatutDemande


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
