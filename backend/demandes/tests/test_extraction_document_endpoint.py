from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur

from ..extracteur_fdr import ExtractionDocumentIndisponible, FakeExtracteurFdr
from ..extraction_fdr import (
    ChampExtraitTexte,
    ChampExtractibleFdr,
    ResultatExtractionFdr,
    get_args,
)
from ..models import Demande, FormulaireRisque

TOUS_LES_CHAMPS = list(get_args(ChampExtractibleFdr))


def _fichier_pdf(nom="devis.pdf", content_type="application/pdf", contenu=b"%PDF-1.4 contenu factice"):
    return SimpleUploadedFile(nom, contenu, content_type=content_type)


def _resultat_partiel(**champs_trouves):
    non_trouves = [champ for champ in TOUS_LES_CHAMPS if champ not in champs_trouves]
    return ResultatExtractionFdr(**champs_trouves, champs_non_trouves=non_trouves)


class ExtractionDocumentEndpointTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.distributeur = Utilisateur.objects.create_user(username="distributeur-extraction", role=Role.DISTRIBUTEUR)
        cls.siege = Utilisateur.objects.create_user(username="siege-extraction", role=Role.SIEGE)

    def setUp(self):
        self.client.force_authenticate(self.distributeur)
        self.url = reverse("demande-extraire-document")

    def test_pdf_valide_retourne_resultat_extraction(self):
        resultat = _resultat_partiel(
            assure_nom=ChampExtraitTexte(valeur="Jean Dupont", confiance=0.92, page=1, extrait_source="Assuré : Jean Dupont"),
        )
        with patch("demandes.views.distributeur.obtenir_extracteur_fdr", return_value=FakeExtracteurFdr(resultat=resultat)):
            response = self.client.post(self.url, {"document": _fichier_pdf()}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["assure_nom"]["valeur"], "Jean Dupont")
        self.assertEqual(response.data["assure_nom"]["confiance"], 0.92)
        self.assertEqual(response.data["assure_nom"]["page"], 1)
        self.assertEqual(response.data["assure_nom"]["extrait_source"], "Assuré : Jean Dupont")
        self.assertEqual(
            sorted(response.data["champs_non_trouves"]),
            sorted(champ for champ in TOUS_LES_CHAMPS if champ != "assure_nom"),
        )

    def test_resultat_partiel_avec_champs_non_trouves(self):
        resultat = _resultat_partiel(
            chantier_nom=ChampExtraitTexte(valeur="Tour Horizon", confiance=0.6),
        )
        with patch("demandes.views.distributeur.obtenir_extracteur_fdr", return_value=FakeExtracteurFdr(resultat=resultat)):
            response = self.client.post(self.url, {"document": _fichier_pdf()}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("assure_nom", response.data["champs_non_trouves"])
        self.assertIsNone(response.data["assure_nom"])
        self.assertEqual(response.data["chantier_nom"]["valeur"], "Tour Horizon")

    def test_fichier_absent(self):
        response = self.client.post(self.url, {}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_fichier_vide(self):
        response = self.client.post(
            self.url, {"document": _fichier_pdf(contenu=b"")}, format="multipart"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mime_non_pdf(self):
        response = self.client.post(
            self.url,
            {"document": _fichier_pdf(nom="image.png", content_type="image/png", contenu=b"contenu")},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_extension_pdf_mais_mime_incorrect_rejete(self):
        response = self.client.post(
            self.url,
            {"document": _fichier_pdf(nom="devis.pdf", content_type="image/png")},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_extraction_indisponible(self):
        with patch("demandes.views.distributeur.obtenir_extracteur_fdr") as mock_obtenir:
            mock_obtenir.return_value.extraire.side_effect = ExtractionDocumentIndisponible("panne fournisseur")
            response = self.client.post(self.url, {"document": _fichier_pdf()}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["code"], "EXTRACTION_INDISPONIBLE")
        self.assertNotIn("panne fournisseur", str(response.data))

    def test_indisponibilite_distincte_de_aucun_champ_trouve(self):
        resultat_vide = _resultat_partiel()
        with patch("demandes.views.distributeur.obtenir_extracteur_fdr", return_value=FakeExtracteurFdr(resultat=resultat_vide)):
            reponse_vide = self.client.post(self.url, {"document": _fichier_pdf()}, format="multipart")
        with patch("demandes.views.distributeur.obtenir_extracteur_fdr") as mock_obtenir:
            mock_obtenir.return_value.extraire.side_effect = ExtractionDocumentIndisponible()
            reponse_indisponible = self.client.post(self.url, {"document": _fichier_pdf()}, format="multipart")
        self.assertEqual(reponse_vide.status_code, status.HTTP_200_OK)
        self.assertEqual(reponse_vide.data["champs_non_trouves"], TOUS_LES_CHAMPS)
        self.assertEqual(reponse_indisponible.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    def test_aucune_ecriture_db(self):
        with patch(
            "demandes.views.distributeur.obtenir_extracteur_fdr",
            return_value=FakeExtracteurFdr(resultat=_resultat_partiel()),
        ):
            self.client.post(self.url, {"document": _fichier_pdf()}, format="multipart")
        self.assertEqual(Demande.objects.count(), 0)
        self.assertEqual(FormulaireRisque.objects.count(), 0)

    def test_roles_interdits(self):
        self.client.force_authenticate(self.siege)
        response = self.client.post(self.url, {"document": _fichier_pdf()}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonyme_interdit(self):
        self.client.force_authenticate(None)
        response = self.client.post(self.url, {"document": _fichier_pdf()}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
