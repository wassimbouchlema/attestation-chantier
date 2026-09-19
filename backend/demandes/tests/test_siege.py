import shutil
import tempfile
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur

from ..models import Demande, FormulaireRisque, PieceJustificative, ProjetAttestation, StatutDemande


class SiegeDemandeEndpointTests(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._media_root_tmp = tempfile.mkdtemp(prefix="siege_tests_")
        cls._override_media_root = override_settings(MEDIA_ROOT=cls._media_root_tmp)
        cls._override_media_root.enable()

    @classmethod
    def tearDownClass(cls):
        cls._override_media_root.disable()
        shutil.rmtree(cls._media_root_tmp, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.distributeur = Utilisateur.objects.create_user(
            username="distributeur_siege", password="test1234", role=Role.DISTRIBUTEUR
        )
        self.siege = Utilisateur.objects.create_user(
            username="siege_siege", password="test1234", role=Role.SIEGE
        )

        self.demande_brouillon = Demande.objects.create(
            distributeur=self.distributeur, statut=StatutDemande.BROUILLON
        )
        FormulaireRisque.objects.create(demande=self.demande_brouillon)

        self.demande_en_cours = Demande.objects.create(
            distributeur=self.distributeur, statut=StatutDemande.EN_COURS
        )
        FormulaireRisque.objects.create(
            demande=self.demande_en_cours,
            assure_nom="AXA Construction",
            chantier_nom="Tour Horizon",
            montant_total=Decimal("100000.00"),
        )

        self.demande_traitee = Demande.objects.create(
            distributeur=self.distributeur, statut=StatutDemande.TRAITE
        )
        FormulaireRisque.objects.create(demande=self.demande_traitee)

    def _authentifier(self, utilisateur):
        response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": utilisateur.username, "password": "test1234"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _url_detail(self, demande):
        return reverse("siege-demande-detail", kwargs={"pk": demande.pk})

    def test_siege_liste_ne_contient_que_les_demandes_en_cours(self):
        self._authentifier(self.siege)

        response = self.client.get(reverse("siege-demande-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {resultat["id"] for resultat in response.data["results"]}
        self.assertEqual(ids, {str(self.demande_en_cours.id)})

    def test_siege_liste_expose_le_fdr_et_le_distributeur_pour_laffichage(self):
        self._authentifier(self.siege)

        response = self.client.get(reverse("siege-demande-list"))

        resultat = response.data["results"][0]
        self.assertEqual(resultat["fdr"]["assure_nom"], "AXA Construction")
        self.assertEqual(resultat["fdr"]["chantier_nom"], "Tour Horizon")
        self.assertTrue(resultat["distributeur_nom"])

    def test_distributeur_ne_peut_pas_utiliser_la_liste_siege(self):
        self._authentifier(self.distributeur)

        response = self.client.get(reverse("siege-demande-list"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonyme_recoit_401_sur_la_liste_siege(self):
        response = self.client.get(reverse("siege-demande-list"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_siege_accede_au_detail_dune_demande_en_cours(self):
        self._authentifier(self.siege)

        response = self.client.get(self._url_detail(self.demande_en_cours))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["statut"], StatutDemande.EN_COURS)

    def test_siege_ne_voit_pas_le_detail_dun_brouillon(self):
        self._authentifier(self.siege)

        response = self.client.get(self._url_detail(self.demande_brouillon))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_siege_ne_voit_pas_le_detail_dune_demande_traitee(self):
        self._authentifier(self.siege)

        response = self.client.get(self._url_detail(self.demande_traitee))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_distributeur_ne_peut_pas_utiliser_le_detail_siege(self):
        self._authentifier(self.distributeur)

        response = self.client.get(self._url_detail(self.demande_en_cours))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonyme_recoit_401_sur_le_detail_siege(self):
        response = self.client.get(self._url_detail(self.demande_en_cours))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_siege_consulte_les_pieces_dune_demande_en_cours(self):
        self._authentifier(self.siege)

        response = self.client.get(
            reverse("siege-demande-pieces", kwargs={"pk": self.demande_en_cours.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("pieces", response.data)
        self.assertIn("dossier_complet", response.data)

    def test_siege_consulte_levaluation_du_risque(self):
        self._authentifier(self.siege)

        response = self.client.get(
            reverse("siege-demande-evaluation-risque", kwargs={"pk": self.demande_en_cours.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("score", response.data)

    def test_siege_recoit_404_sur_le_fdr_pdf_absent(self):
        self._authentifier(self.siege)

        response = self.client.get(
            reverse("siege-demande-fdr-pdf", kwargs={"pk": self.demande_en_cours.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_routes_projet_et_pdf_siege_absentes_meme_si_un_projet_existe(self):
        ProjetAttestation.objects.create(
            demande=self.demande_en_cours, contenu_html="<p>Projet distributeur</p>"
        )
        self._authentifier(self.siege)

        for suffixe in ("projet-attestation/", "projet-attestation/pdf/"):
            with self.subTest(suffixe=suffixe):
                response = self.client.get(
                    f"/api/siege/demandes/{self.demande_en_cours.pk}/{suffixe}"
                )
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_siege_ne_peut_pas_envoyer_via_lendpoint_distributeur(self):
        self._authentifier(self.siege)

        response = self.client.post(
            reverse("demande-envoyer", kwargs={"pk": self.demande_en_cours.pk}), {}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


def _fichier_upload(nom="piece.pdf", content_type="application/pdf", contenu=b"%PDF-1.4 contenu factice"):
    return SimpleUploadedFile(nom, contenu, content_type=content_type)


class SiegePieceFichierEndpointTests(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._media_root_tmp = tempfile.mkdtemp(prefix="siege_piece_tests_")
        cls._override_media_root = override_settings(MEDIA_ROOT=cls._media_root_tmp)
        cls._override_media_root.enable()

    @classmethod
    def tearDownClass(cls):
        cls._override_media_root.disable()
        shutil.rmtree(cls._media_root_tmp, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.distributeur = Utilisateur.objects.create_user(
            username="distributeur_siege_piece", password="test1234", role=Role.DISTRIBUTEUR
        )
        self.siege = Utilisateur.objects.create_user(
            username="siege_siege_piece", password="test1234", role=Role.SIEGE
        )

        self.demande = Demande.objects.create(distributeur=self.distributeur, statut=StatutDemande.EN_COURS)
        FormulaireRisque.objects.create(demande=self.demande)
        self.piece = PieceJustificative.objects.create(
            demande=self.demande,
            type_piece="complexite",
            fichier=_fichier_upload(contenu=b"%PDF-1.4 contenu du justificatif"),
            nom_fichier_original="Justificatif Complexite.pdf",
        )

        self.autre_demande = Demande.objects.create(distributeur=self.distributeur, statut=StatutDemande.EN_COURS)
        FormulaireRisque.objects.create(demande=self.autre_demande)
        self.piece_autre_demande = PieceJustificative.objects.create(
            demande=self.autre_demande,
            type_piece="complexite",
            fichier=_fichier_upload(),
            nom_fichier_original="autre.pdf",
        )

    def _authentifier(self, utilisateur):
        response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": utilisateur.username, "password": "test1234"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _url_fichier(self, demande, piece):
        return reverse("siege-piece-fichier", kwargs={"demande_id": demande.pk, "piece_id": piece.pk})

    def test_siege_recupere_le_contenu_dune_piece_valide(self):
        self._authentifier(self.siege)

        response = self.client.get(self._url_fichier(self.demande, self.piece))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        contenu = b"".join(response.streaming_content)
        self.assertEqual(contenu, b"%PDF-1.4 contenu du justificatif")
        # Le nom présenté doit être `nom_fichier_original`, jamais le nom opaque du storage.
        self.assertIn("Justificatif Complexite.pdf", response["Content-Disposition"])

    def test_mauvais_piece_id_recoit_404(self):
        self._authentifier(self.siege)
        import uuid

        response = self.client.get(
            reverse("siege-piece-fichier", kwargs={"demande_id": self.demande.pk, "piece_id": uuid.uuid4()})
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_piece_dune_autre_demande_recoit_404(self):
        self._authentifier(self.siege)

        response = self.client.get(self._url_fichier(self.demande, self.piece_autre_demande))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_distributeur_recoit_403_sur_la_route_siege(self):
        self._authentifier(self.distributeur)

        response = self.client.get(self._url_fichier(self.demande, self.piece))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonyme_recoit_401(self):
        response = self.client.get(self._url_fichier(self.demande, self.piece))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
