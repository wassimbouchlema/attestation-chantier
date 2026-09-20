import importlib

from django.test import override_settings
from django.urls import include, path, reverse
from rest_framework.test import APITestCase
from rest_framework import status

from . import urls as urls_comptes
from .models import Role, Utilisateur

urlpatterns = [
    path("api/", include(urls_comptes.urlpatterns + urls_comptes.dev_urlpatterns)),
]


class RoleContrainteTests(APITestCase):
    def test_role_invalide_rejete_par_la_base(self):
        from django.db import IntegrityError, transaction

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Utilisateur.objects.create(username="invalide", role="ADMIN")

    def test_utilisateur_a_un_role_explicite_et_requetable(self):
        utilisateur = Utilisateur.objects.create_user(
            username="quelqu_un", password="motdepasse123", role=Role.DISTRIBUTEUR
        )
        recharge = Utilisateur.objects.get(username="quelqu_un")
        self.assertEqual(recharge.role, Role.DISTRIBUTEUR)


@override_settings(ROOT_URLCONF=__name__)
class PermissionsParRoleTests(APITestCase):
    def setUp(self):
        self.distributeur = Utilisateur.objects.create_user(
            username="distributeur_test", password="test1234", role=Role.DISTRIBUTEUR
        )
        self.siege = Utilisateur.objects.create_user(
            username="siege_test", password="test1234", role=Role.SIEGE
        )

    def _obtenir_token(self, username, password):
        response = self.client.post(
            reverse("token_obtain_pair"), {"username": username, "password": password}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data["access"]

    def _authentifier(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_distributeur_accede_a_son_espace(self):
        token = self._obtenir_token("distributeur_test", "test1234")
        self._authentifier(token)
        response = self.client.get(reverse("test_distributeur"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_distributeur_recoit_403_sur_espace_siege(self):
        token = self._obtenir_token("distributeur_test", "test1234")
        self._authentifier(token)
        response = self.client.get(reverse("test_siege"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_siege_accede_a_son_espace(self):
        token = self._obtenir_token("siege_test", "test1234")
        self._authentifier(token)
        response = self.client.get(reverse("test_siege"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_siege_recoit_403_sur_espace_distributeur(self):
        token = self._obtenir_token("siege_test", "test1234")
        self._authentifier(token)
        response = self.client.get(reverse("test_distributeur"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonyme_est_rejete(self):
        response = self.client.get(reverse("test_distributeur"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class RoutesDeDeveloppementTests(APITestCase):
    def test_routes_de_test_absentes_quand_non_exposees(self):
        try:
            with override_settings(EXPOSE_DEV_ROUTES=False):
                importlib.reload(urls_comptes)
                noms = [route.name for route in urls_comptes.urlpatterns]
            self.assertNotIn("test_siege", noms)
            self.assertNotIn("test_distributeur", noms)
        finally:
            importlib.reload(urls_comptes)


class MeEndpointTests(APITestCase):
    def setUp(self):
        self.distributeur = Utilisateur.objects.create_user(
            username="distributeur_me",
            password="test1234",
            role=Role.DISTRIBUTEUR,
            first_name="Jean",
            last_name="Dupont",
        )

    def test_utilisateur_authentifie_recoit_son_profil(self):
        token_response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": "distributeur_me", "password": "test1234"},
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_response.data['access']}")

        response = self.client.get(reverse("me"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "distributeur_me")
        self.assertEqual(response.data["role"], Role.DISTRIBUTEUR)
        self.assertEqual(response.data["first_name"], "Jean")
        self.assertNotIn("password", response.data)

    def test_anonyme_recoit_401_sur_me(self):
        response = self.client.get(reverse("me"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
