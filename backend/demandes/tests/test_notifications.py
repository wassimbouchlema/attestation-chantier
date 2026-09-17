import shutil
import tempfile
from datetime import date
from decimal import Decimal

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur

from ..models import (
    Demande,
    FormulaireRisque,
    Notification,
    TypeChantier,
    TypeIntervention,
    Usage,
)


def _valeurs_fdr_complet():
    return dict(
        assure_nom="AXA Construction",
        assure_ville="Paris",
        assure_numero_contrat="123456789",
        chantier_nom="Tour Horizon",
        chantier_ville="Lyon",
        type_chantier=TypeChantier.NEUVE,
        chantier_atypique=False,
        usage=Usage.BUREAU,
        date_debut=date(2026, 1, 10),
        date_fin=date(2026, 6, 30),
        montant_total=Decimal("100000.00"),
        intervention_description="Rénovation complète",
        intervention_montant_prestation=Decimal("50000.00"),
        intervention_type=TypeIntervention.PRINCIPALE,
        activite_couverte=True,
        travaux_standards=True,
    )


class NotificationEndpointTests(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._media_root_tmp = tempfile.mkdtemp(prefix="notifications_tests_")
        cls._override_media_root = override_settings(MEDIA_ROOT=cls._media_root_tmp)
        cls._override_media_root.enable()

    @classmethod
    def tearDownClass(cls):
        cls._override_media_root.disable()
        shutil.rmtree(cls._media_root_tmp, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.distributeur = Utilisateur.objects.create_user(
            username="distributeur_notif", password="test1234", role=Role.DISTRIBUTEUR
        )
        self.siege = Utilisateur.objects.create_user(
            username="siege_notif", password="test1234", role=Role.SIEGE
        )
        # Rôle DISTRIBUTEUR (pas SIEGE) : un deuxième compte SIEGE ferait échouer
        # `obtenir_compte_siege_unique()` dans `_envoyer_la_demande()` (0 ou
        # plusieurs comptes SIEGE => erreur de configuration, par conception).
        # Notification n'est de toute façon pas restreinte par rôle : n'importe
        # quel compte convient pour tester l'isolation par destinataire.
        self.autre_utilisateur = Utilisateur.objects.create_user(
            username="autre_utilisateur_notif", password="test1234", role=Role.DISTRIBUTEUR
        )
        self.demande = Demande.objects.create(distributeur=self.distributeur)
        self.fdr = FormulaireRisque.objects.create(demande=self.demande, **_valeurs_fdr_complet())

    def _authentifier(self, utilisateur):
        response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": utilisateur.username, "password": "test1234"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _envoyer_la_demande(self):
        """Utilise le vrai flux d'envoi pour obtenir une notification réelle et cohérente."""
        self._authentifier(self.distributeur)
        response = self.client.post(
            reverse("demande-envoyer", kwargs={"pk": self.demande.pk}), {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials()

    def test_notification_creee_apres_envoi_pour_le_siege(self):
        self._envoyer_la_demande()

        notification = Notification.objects.get(demande=self.demande)

        self.assertEqual(notification.destinataire, self.siege)
        self.assertEqual(notification.type_notification, "DEMANDE_ENVOYEE")
        self.assertIsNone(notification.seen_at)

    def test_get_notifications_retourne_la_notification_et_le_compteur(self):
        self._envoyer_la_demande()
        self._authentifier(self.siege)

        response = self.client.get(reverse("notification-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["non_vues"], 1)
        self.assertEqual(len(response.data["notifications"]), 1)
        notification_data = response.data["notifications"][0]
        self.assertEqual(notification_data["type_notification"], "DEMANDE_ENVOYEE")
        self.assertEqual(notification_data["titre"], "Nouvelle demande reçue")
        self.assertEqual(str(notification_data["demande_id"]), str(self.demande.id))
        self.assertIsNone(notification_data["seen_at"])

    def test_get_notifications_ne_modifie_pas_seen_at(self):
        self._envoyer_la_demande()
        self._authentifier(self.siege)

        self.client.get(reverse("notification-list"))
        self.client.get(reverse("notification-list"))

        notification = Notification.objects.get(demande=self.demande)
        self.assertIsNone(notification.seen_at)

    def test_marquer_vues_renseigne_seen_at(self):
        self._envoyer_la_demande()
        notification = Notification.objects.get(demande=self.demande)
        self._authentifier(self.siege)

        response = self.client.post(
            reverse("notification-marquer-vues"), {"ids": [str(notification.id)]}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        notification.refresh_from_db()
        self.assertIsNotNone(notification.seen_at)

    def test_apres_marquer_vues_notification_toujours_presente_et_compteur_a_zero(self):
        self._envoyer_la_demande()
        notification = Notification.objects.get(demande=self.demande)
        self._authentifier(self.siege)
        self.client.post(reverse("notification-marquer-vues"), {"ids": [str(notification.id)]}, format="json")

        response = self.client.get(reverse("notification-list"))

        self.assertEqual(response.data["non_vues"], 0)
        self.assertEqual(len(response.data["notifications"]), 1)
        self.assertTrue(Notification.objects.filter(pk=notification.pk).exists())

    def test_marquer_vues_est_idempotent(self):
        self._envoyer_la_demande()
        notification = Notification.objects.get(demande=self.demande)
        self._authentifier(self.siege)
        self.client.post(reverse("notification-marquer-vues"), {"ids": [str(notification.id)]}, format="json")
        premiere_valeur = Notification.objects.get(pk=notification.pk).seen_at

        response = self.client.post(
            reverse("notification-marquer-vues"), {"ids": [str(notification.id)]}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Notification.objects.get(pk=notification.pk).seen_at, premiere_valeur)

    def test_seules_les_notifications_dont_lid_est_fourni_deviennent_vues(self):
        self._envoyer_la_demande()
        notification_1 = Notification.objects.get(demande=self.demande)
        autre_demande = Demande.objects.create(distributeur=self.distributeur)
        FormulaireRisque.objects.create(demande=autre_demande, **_valeurs_fdr_complet())
        self.demande = autre_demande
        self._envoyer_la_demande()
        notification_2 = Notification.objects.exclude(pk=notification_1.pk).get()
        self._authentifier(self.siege)

        response = self.client.post(
            reverse("notification-marquer-vues"), {"ids": [str(notification_1.id)]}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(Notification.objects.get(pk=notification_1.pk).seen_at)
        self.assertIsNone(Notification.objects.get(pk=notification_2.pk).seen_at)

    def test_notification_dun_autre_utilisateur_jamais_modifiee(self):
        self._envoyer_la_demande()
        notification = Notification.objects.get(demande=self.demande)
        self._authentifier(self.autre_utilisateur)

        response = self.client.post(
            reverse("notification-marquer-vues"), {"ids": [str(notification.id)]}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        notification.refresh_from_db()
        self.assertIsNone(notification.seen_at)

    def test_uuid_inconnu_ne_provoque_aucune_erreur_ni_fuite(self):
        import uuid

        self._envoyer_la_demande()
        self._authentifier(self.siege)

        response = self.client.post(
            reverse("notification-marquer-vues"), {"ids": [str(uuid.uuid4())]}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["marquees"], 0)

    def test_get_notifications_ne_retourne_que_celles_du_demandeur(self):
        self._envoyer_la_demande()
        self._authentifier(self.autre_utilisateur)

        response = self.client.get(reverse("notification-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["non_vues"], 0)
        self.assertEqual(response.data["notifications"], [])

    def test_anonyme_recoit_401_sur_notifications(self):
        self.assertEqual(
            self.client.get(reverse("notification-list")).status_code, status.HTTP_401_UNAUTHORIZED
        )
        self.assertEqual(
            self.client.post(reverse("notification-marquer-vues"), {"ids": []}, format="json").status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_distributeur_peut_aussi_consulter_ses_propres_notifications_vides(self):
        self._envoyer_la_demande()
        self._authentifier(self.distributeur)

        response = self.client.get(reverse("notification-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["notifications"], [])
