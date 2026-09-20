from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur

from ..models import DecisionDemande, Demande, StatutDemande


class ReportingEndpointTests(APITestCase):
    def setUp(self):
        self.distributeur = Utilisateur.objects.create_user(
            username="distributeur_reporting", password="test1234", role=Role.DISTRIBUTEUR
        )
        self.autre_distributeur = Utilisateur.objects.create_user(
            username="autre_distributeur_reporting", password="test1234", role=Role.DISTRIBUTEUR
        )
        self.siege = Utilisateur.objects.create_user(
            username="siege_reporting", password="test1234", role=Role.SIEGE
        )
        self.url = reverse("reporting")

    def _creer(self, distributeur, statut, decision=None, nombre=1):
        for _ in range(nombre):
            Demande.objects.create(distributeur=distributeur, statut=statut, decision=decision)

    def _jeu_de_donnees(self):
        self._creer(self.distributeur, StatutDemande.BROUILLON, nombre=2)
        self._creer(self.distributeur, StatutDemande.EN_COURS, nombre=2)
        self._creer(self.distributeur, StatutDemande.TRAITE, DecisionDemande.ACCEPTEE, nombre=3)
        self._creer(self.distributeur, StatutDemande.TRAITE, DecisionDemande.REFUSEE)
        self._creer(self.autre_distributeur, StatutDemande.BROUILLON)
        self._creer(self.autre_distributeur, StatutDemande.EN_COURS, nombre=4)
        self._creer(self.autre_distributeur, StatutDemande.TRAITE, DecisionDemande.ACCEPTEE)
        self._creer(self.autre_distributeur, StatutDemande.TRAITE, DecisionDemande.REFUSEE, nombre=2)

    def test_authentification_requise(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_distributeur_ne_voit_que_ses_propres_compteurs(self):
        self._jeu_de_donnees()
        self.client.force_authenticate(self.distributeur)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"total": 8, "brouillons": 2, "en_cours": 2, "acceptees": 3, "refusees": 1})

    def test_siege_voit_les_compteurs_globaux(self):
        self._jeu_de_donnees()
        self.client.force_authenticate(self.siege)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"total": 13, "brouillons": 0, "en_cours": 6, "acceptees": 4, "refusees": 3})

    def test_brouillons_comptes_dans_le_total_du_distributeur_mais_pas_du_siege(self):
        self._creer(self.distributeur, StatutDemande.BROUILLON, nombre=3)

        self.client.force_authenticate(self.distributeur)
        response = self.client.get(self.url)
        self.assertEqual(response.data, {"total": 3, "brouillons": 3, "en_cours": 0, "acceptees": 0, "refusees": 0})

        self.client.force_authenticate(self.siege)
        response = self.client.get(self.url)
        self.assertEqual(response.data, {"total": 0, "brouillons": 0, "en_cours": 0, "acceptees": 0, "refusees": 0})

    def test_sans_demande_tous_les_compteurs_sont_a_zero(self):
        for utilisateur in (self.distributeur, self.siege):
            self.client.force_authenticate(utilisateur)
            response = self.client.get(self.url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data, {"total": 0, "brouillons": 0, "en_cours": 0, "acceptees": 0, "refusees": 0})

    def test_methode_non_autorisee(self):
        self.client.force_authenticate(self.distributeur)
        response = self.client.post(self.url, {})
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
