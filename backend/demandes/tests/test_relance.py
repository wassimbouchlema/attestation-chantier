from datetime import timedelta
from unittest.mock import patch

from django.core import mail
from django.urls import reverse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur

from ..models import Demande, Notification, StatutDemande


class RelanceDemandeEndpointTests(APITestCase):
    def setUp(self):
        # setUp (pas setUpTestData) : certains tests suppriment/modifient le
        # compte SIÈGE (email vide, suppression) — chaque test a besoin d'un
        # jeu de comptes frais.
        self.distributeur_a = Utilisateur.objects.create_user(
            username="distributeur_relance_a", password="test1234", role=Role.DISTRIBUTEUR
        )
        self.distributeur_b = Utilisateur.objects.create_user(
            username="distributeur_relance_b", password="test1234", role=Role.DISTRIBUTEUR
        )
        self.siege = Utilisateur.objects.create_user(
            username="siege_relance",
            password="test1234",
            role=Role.SIEGE,
            email="siege@attestation-chantier.local",
        )
        self.demande = Demande.objects.create(
            distributeur=self.distributeur_a, statut=StatutDemande.EN_COURS
        )

    def _authentifier(self, utilisateur):
        response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": utilisateur.username, "password": "test1234"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _url(self, demande=None):
        return reverse("demande-relancer", kwargs={"pk": (demande or self.demande).pk})

    def _figer_maintenant(self, instant):
        return patch("demandes.views.distributeur.timezone.now", return_value=instant)

    # --- Succès ---

    def test_premiere_relance_reussie(self):
        instant = timezone.now()
        self._authentifier(self.distributeur_a)

        with self._figer_maintenant(instant):
            response = self.client.post(self._url(), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.siege.email])
        self.assertEqual(mail.outbox[0].subject, "[Attestation de chantier] Relance d'une demande en cours")
        self.assertIn(str(self.demande.id), mail.outbox[0].body)

        self.demande.refresh_from_db()
        self.assertEqual(self.demande.last_relance_at, instant)
        # response.data contient la représentation DRF déjà sérialisée (chaîne
        # ISO 8601, éventuellement localisée) : comparer les instants réels,
        # pas les chaînes, pour rester indépendant du fuseau de rendu.
        self.assertEqual(parse_datetime(response.data["last_relance_at"]), instant)
        self.assertEqual(response.data["prochaine_relance_at"], instant + timedelta(hours=24))

        notification = Notification.objects.get(demande=self.demande, type_notification="RELANCE")
        self.assertEqual(notification.destinataire, self.siege)
        self.assertIsNone(notification.seen_at)

    def test_relance_avant_24h_refusee_409(self):
        instant = timezone.now()
        self._authentifier(self.distributeur_a)
        with self._figer_maintenant(instant):
            self.client.post(self._url(), {}, format="json")

        with self._figer_maintenant(instant + timedelta(hours=23, minutes=59)):
            response = self.client.post(self._url(), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "DELAI_RELANCE_NON_ECOULE")
        self.assertEqual(response.data["prochaine_relance_at"], instant + timedelta(hours=24))
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(Notification.objects.filter(demande=self.demande).count(), 1)
        self.demande.refresh_from_db()
        self.assertEqual(self.demande.last_relance_at, instant)

    def test_relance_exactement_24h_autorisee(self):
        instant = timezone.now()
        self._authentifier(self.distributeur_a)
        with self._figer_maintenant(instant):
            self.client.post(self._url(), {}, format="json")

        with self._figer_maintenant(instant + timedelta(hours=24)):
            response = self.client.post(self._url(), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 2)

    def test_relance_apres_24h_autorisee(self):
        instant = timezone.now()
        self._authentifier(self.distributeur_a)
        with self._figer_maintenant(instant):
            self.client.post(self._url(), {}, format="json")

        with self._figer_maintenant(instant + timedelta(hours=25)):
            response = self.client.post(self._url(), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 2)

    # --- Statut ---

    def test_relance_brouillon_refusee_409(self):
        demande = Demande.objects.create(distributeur=self.distributeur_a, statut=StatutDemande.BROUILLON)
        self._authentifier(self.distributeur_a)

        response = self.client.post(self._url(demande), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "RELANCE_NON_AUTORISEE")
        self.assertEqual(len(mail.outbox), 0)

    def test_relance_traite_refusee_409(self):
        demande = Demande.objects.create(distributeur=self.distributeur_a, statut=StatutDemande.TRAITE)
        self._authentifier(self.distributeur_a)

        response = self.client.post(self._url(demande), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "RELANCE_NON_AUTORISEE")
        self.assertEqual(len(mail.outbox), 0)

    # --- Ownership / rôle ---

    def test_relance_autre_distributeur_404(self):
        self._authentifier(self.distributeur_b)

        response = self.client.post(self._url(), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(len(mail.outbox), 0)

    def test_relance_siege_403(self):
        self._authentifier(self.siege)

        response = self.client.post(self._url(), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(len(mail.outbox), 0)

    def test_relance_anonyme_401(self):
        response = self.client.post(self._url(), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(len(mail.outbox), 0)

    # --- Échecs email ---

    def test_siege_sans_email_echoue_proprement(self):
        self.siege.email = ""
        self.siege.save(update_fields=["email"])
        self._authentifier(self.distributeur_a)

        response = self.client.post(self._url(), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(response.data["code"], "EMAIL_SIEGE_INDISPONIBLE")
        self.assertEqual(len(mail.outbox), 0)
        self.demande.refresh_from_db()
        self.assertIsNone(self.demande.last_relance_at)
        self.assertFalse(Notification.objects.filter(demande=self.demande).exists())

    def test_echec_envoi_email_rollback_complet(self):
        self._authentifier(self.distributeur_a)

        with patch("demandes.views.distributeur.EmailMessage.send", side_effect=RuntimeError("SMTP indisponible")):
            response = self.client.post(self._url(), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.demande.refresh_from_db()
        self.assertIsNone(self.demande.last_relance_at)
        self.assertFalse(Notification.objects.filter(demande=self.demande).exists())
        self.assertEqual(len(mail.outbox), 0)
