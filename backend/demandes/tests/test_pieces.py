import shutil
import tempfile
import uuid
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur

from ..models import Demande, FormulaireRisque, PieceJustificative, StatutDemande, Usage
from ..rules import PIECE_ACTIVITE, PIECE_COMPLEXITE, PIECE_USAGE


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
