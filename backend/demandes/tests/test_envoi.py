import shutil
import tempfile
from datetime import date
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur
from comptes.services import ErreurConfigurationSiege, obtenir_compte_siege_unique

from ..models import (
    Demande,
    FormulaireRisque,
    Notification,
    StatutDemande,
    TypeChantier,
    TypeIntervention,
    Usage,
)
from ..rules import PIECE_COMPLEXITE


def _fichier_upload(nom="piece.pdf", content_type="application/pdf", contenu=b"%PDF-1.4 contenu factice"):
    return SimpleUploadedFile(nom, contenu, content_type=content_type)


def _valeurs_fdr_complet(chantier_atypique=False):
    """FDR entièrement valide pour l'envoi. `chantier_atypique=False` par défaut
    pour que `calculer_pieces_requises` retourne [] (aucune pièce à uploader) —
    passer True déclenche PIECE_COMPLEXITE pour tester le cas pièces manquantes."""
    return dict(
        assure_nom="AXA Construction",
        assure_ville="Paris",
        assure_numero_contrat="1234567890123",
        chantier_nom="Tour Horizon",
        chantier_ville="Lyon",
        type_chantier=TypeChantier.NEUVE,
        chantier_atypique=chantier_atypique,
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


class ObtenirCompteSiegeUniqueTests(TestCase):
    """Accède à la DB (comptage de comptes SIÈGE) : TestCase, pas SimpleTestCase."""

    def test_aucun_compte_siege_leve_erreur_configuration(self):
        Utilisateur.objects.create_user(username="distrib_seul", password="x", role=Role.DISTRIBUTEUR)

        with self.assertRaises(ErreurConfigurationSiege):
            obtenir_compte_siege_unique()

    def test_un_seul_compte_siege_retourne_ce_compte(self):
        siege = Utilisateur.objects.create_user(username="siege_unique", password="x", role=Role.SIEGE)

        self.assertEqual(obtenir_compte_siege_unique(), siege)

    def test_plusieurs_comptes_siege_leve_erreur_configuration(self):
        Utilisateur.objects.create_user(username="siege_1", password="x", role=Role.SIEGE)
        Utilisateur.objects.create_user(username="siege_2", password="x", role=Role.SIEGE)

        with self.assertRaises(ErreurConfigurationSiege):
            obtenir_compte_siege_unique()


class EnvoiDemandeEndpointTests(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._media_root_tmp = tempfile.mkdtemp(prefix="envoi_tests_")
        cls._override_media_root = override_settings(MEDIA_ROOT=cls._media_root_tmp)
        cls._override_media_root.enable()

    @classmethod
    def tearDownClass(cls):
        cls._override_media_root.disable()
        shutil.rmtree(cls._media_root_tmp, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        # setUp (pas setUpTestData) : chaque test a besoin d'un compte SIÈGE unique
        # frais, et certains tests suppriment/ajoutent des comptes SIÈGE.
        self.distributeur_a = Utilisateur.objects.create_user(
            username="distributeur_envoi_a", password="test1234", role=Role.DISTRIBUTEUR
        )
        self.distributeur_b = Utilisateur.objects.create_user(
            username="distributeur_envoi_b", password="test1234", role=Role.DISTRIBUTEUR
        )
        self.siege = Utilisateur.objects.create_user(
            username="siege_envoi", password="test1234", role=Role.SIEGE
        )
        self.demande = Demande.objects.create(distributeur=self.distributeur_a)
        self.fdr = FormulaireRisque.objects.create(demande=self.demande)

    def _authentifier(self, utilisateur):
        response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": utilisateur.username, "password": "test1234"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _url_envoyer(self, demande):
        return reverse("demande-envoyer", kwargs={"pk": demande.pk})

    def _url_commentaire(self, demande):
        return reverse("demande-commentaire", kwargs={"pk": demande.pk})

    def _url_fdr_pdf(self, demande):
        return reverse("demande-fdr-pdf", kwargs={"pk": demande.pk})

    def _completer_fdr(self, **overrides):
        valeurs = _valeurs_fdr_complet()
        valeurs.update(overrides)
        for champ, valeur in valeurs.items():
            setattr(self.fdr, champ, valeur)
        self.fdr.save()

    # --- Commentaire ---

    def test_patch_commentaire_persiste_en_brouillon(self):
        self._authentifier(self.distributeur_a)

        response = self.client.patch(
            self._url_commentaire(self.demande),
            {"commentaire_distributeur": "Merci de traiter rapidement."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.demande.refresh_from_db()
        self.assertEqual(self.demande.commentaire_distributeur, "Merci de traiter rapidement.")
        self.assertEqual(self.demande.statut, StatutDemande.BROUILLON)

    def test_patch_commentaire_hors_brouillon_refuse_409(self):
        self.demande.statut = StatutDemande.EN_COURS
        self.demande.save(update_fields=["statut"])
        self._authentifier(self.distributeur_a)

        response = self.client.patch(
            self._url_commentaire(self.demande), {"commentaire_distributeur": "Trop tard"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    # --- Envoi : succès ---

    def test_envoi_reussi_fdr_complet_sans_pieces_requises(self):
        self._completer_fdr()
        self._authentifier(self.distributeur_a)

        response = self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["statut"], StatutDemande.EN_COURS)
        self.assertIsNotNone(response.data["envoye_at"])

        self.demande.refresh_from_db()
        self.assertEqual(self.demande.statut, StatutDemande.EN_COURS)
        self.assertIsNotNone(self.demande.envoye_at)
        self.assertTrue(self.demande.fdr_pdf)

        notification = Notification.objects.get(demande=self.demande)
        self.assertEqual(notification.destinataire, self.siege)
        self.assertEqual(notification.type_notification, "DEMANDE_ENVOYEE")
        self.assertIsNone(notification.seen_at)

    def test_envoi_utilise_le_commentaire_transmis_dans_le_body(self):
        self._completer_fdr()
        self._authentifier(self.distributeur_a)

        response = self.client.post(
            self._url_envoyer(self.demande),
            {"commentaire_distributeur": "Commentaire final au moment de l'envoi"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.demande.refresh_from_db()
        self.assertEqual(self.demande.commentaire_distributeur, "Commentaire final au moment de l'envoi")

    def test_envoi_sans_commentaire_dans_le_body_conserve_le_commentaire_deja_sauvegarde(self):
        self._completer_fdr()
        self._authentifier(self.distributeur_a)
        self.client.patch(
            self._url_commentaire(self.demande), {"commentaire_distributeur": "Déjà sauvegardé"}, format="json"
        )

        response = self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.demande.refresh_from_db()
        self.assertEqual(self.demande.commentaire_distributeur, "Déjà sauvegardé")

    def test_envoi_ignore_toute_tentative_de_forcer_le_statut(self):
        self._completer_fdr()
        self._authentifier(self.distributeur_a)

        response = self.client.post(
            self._url_envoyer(self.demande), {"statut": "TRAITE"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["statut"], StatutDemande.EN_COURS)

    # --- Envoi : FDR invalide ---

    def test_envoi_fdr_vide_refuse_400_fdr_invalide(self):
        self._authentifier(self.distributeur_a)

        response = self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "FDR_INVALIDE")
        self.assertIn("assure_nom", response.data["erreurs"])
        self.demande.refresh_from_db()
        self.assertEqual(self.demande.statut, StatutDemande.BROUILLON)
        self.assertFalse(self.demande.fdr_pdf)
        self.assertFalse(Notification.objects.filter(demande=self.demande).exists())

    def test_envoi_champ_texte_blanc_traite_comme_manquant(self):
        self._completer_fdr(assure_nom="   ")
        self._authentifier(self.distributeur_a)

        response = self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "FDR_INVALIDE")
        self.assertIn("assure_nom", response.data["erreurs"])

    def test_envoi_incoherence_croisee_refusee(self):
        self._completer_fdr(
            montant_total=Decimal("1000.00"), intervention_montant_prestation=Decimal("1000.00")
        )
        self._authentifier(self.distributeur_a)

        response = self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "FDR_INVALIDE")
        self.assertIn("intervention_montant_prestation", response.data["erreurs"])

    # --- Envoi : pièces manquantes ---

    def test_envoi_pieces_manquantes_refuse_400_dossier_incomplet(self):
        self._completer_fdr(chantier_atypique=True)
        self._authentifier(self.distributeur_a)

        response = self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "DOSSIER_INCOMPLET")
        self.assertEqual(response.data["pieces_manquantes"], [PIECE_COMPLEXITE])
        self.demande.refresh_from_db()
        self.assertEqual(self.demande.statut, StatutDemande.BROUILLON)
        self.assertFalse(self.demande.fdr_pdf)
        self.assertFalse(Notification.objects.filter(demande=self.demande).exists())

    def test_envoi_reussi_une_fois_la_piece_manquante_uploadee(self):
        self._completer_fdr(chantier_atypique=True)
        self._authentifier(self.distributeur_a)
        self.client.post(
            reverse("piece-list", kwargs={"demande_id": self.demande.pk}),
            {"type_piece": PIECE_COMPLEXITE, "fichier": _fichier_upload()},
            format="multipart",
        )

        response = self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # --- Envoi : statut / propriété / rôle ---

    def test_envoi_demande_deja_en_cours_refuse_409(self):
        self._completer_fdr()
        self.demande.statut = StatutDemande.EN_COURS
        self.demande.save(update_fields=["statut"])
        self._authentifier(self.distributeur_a)

        response = self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_envoi_autre_distributeur_recoit_404(self):
        self._completer_fdr()
        self._authentifier(self.distributeur_b)

        response = self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.demande.refresh_from_db()
        self.assertEqual(self.demande.statut, StatutDemande.BROUILLON)

    def test_envoi_404_conserve_le_message_de_get_object_or_404(self):
        self._completer_fdr()
        self._authentifier(self.distributeur_b)

        response = self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.assertEqual(
            response.data,
            {"detail": "Aucun objet Demande ne correspond à cette requête."},
        )

    def test_envoi_anonyme_recoit_401(self):
        response = self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_envoi_siege_recoit_403(self):
        self._completer_fdr()
        self._authentifier(self.siege)

        response = self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_envoi_sans_compte_siege_configure_retourne_500(self):
        self.siege.delete()
        self._completer_fdr()
        self._authentifier(self.distributeur_a)

        response = self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.demande.refresh_from_db()
        self.assertEqual(self.demande.statut, StatutDemande.BROUILLON)
        self.assertFalse(self.demande.fdr_pdf)

    def test_envoi_plusieurs_comptes_siege_configure_retourne_500(self):
        Utilisateur.objects.create_user(
            username="siege_envoi_bis", password="test1234", role=Role.SIEGE
        )
        self._completer_fdr()
        self._authentifier(self.distributeur_a)

        response = self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(
            response.data,
            {"detail": "Configuration serveur invalide : compte SIÈGE introuvable ou ambigu."},
        )
        self.demande.refresh_from_db()
        self.assertEqual(self.demande.statut, StatutDemande.BROUILLON)
        self.assertIsNone(self.demande.envoye_at)
        self.assertFalse(self.demande.fdr_pdf)
        self.assertFalse(Notification.objects.filter(demande=self.demande).exists())
        self.assertTrue(self._aucun_fichier_fdr_pdf(self.demande))

    # --- Envoi : échec tardif (fichier déjà écrit, transaction non aboutie) ---

    def _aucun_fichier_fdr_pdf(self, demande):
        dossier = Path(self._media_root_tmp) / "fdr-pdf" / str(demande.id)
        return not dossier.exists() or not any(dossier.iterdir())

    def test_envoi_echec_notification_annule_transaction_et_supprime_le_fichier(self):
        self._completer_fdr()
        self._authentifier(self.distributeur_a)

        with patch(
            "demandes.views.distributeur.Notification.objects.create",
            side_effect=RuntimeError("Panne notification"),
        ):
            with self.assertRaises(RuntimeError):
                self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.demande.refresh_from_db()
        self.assertEqual(self.demande.statut, StatutDemande.BROUILLON)
        self.assertIsNone(self.demande.envoye_at)
        self.assertFalse(self.demande.fdr_pdf)
        self.assertFalse(Notification.objects.filter(demande=self.demande).exists())
        self.assertTrue(self._aucun_fichier_fdr_pdf(self.demande))

    def test_envoi_echec_sauvegarde_demande_annule_transaction_et_supprime_le_fichier(self):
        self._completer_fdr()
        self._authentifier(self.distributeur_a)

        with patch(
            "demandes.models.Demande.save",
            side_effect=RuntimeError("Panne sauvegarde"),
        ):
            with self.assertRaises(RuntimeError):
                self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.demande.refresh_from_db()
        self.assertEqual(self.demande.statut, StatutDemande.BROUILLON)
        self.assertIsNone(self.demande.envoye_at)
        self.assertFalse(self.demande.fdr_pdf)
        self.assertFalse(Notification.objects.filter(demande=self.demande).exists())
        self.assertTrue(self._aucun_fichier_fdr_pdf(self.demande))

    # --- PDF ---

    def test_pdf_stocke_est_non_vide_et_commence_par_pdf(self):
        self._completer_fdr()
        self._authentifier(self.distributeur_a)
        self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.demande.refresh_from_db()
        contenu = self.demande.fdr_pdf.read()

        self.assertTrue(len(contenu) > 0)
        self.assertTrue(contenu.startswith(b"%PDF"))

    def test_endpoint_pdf_proprietaire_recoit_le_pdf(self):
        self._completer_fdr()
        self._authentifier(self.distributeur_a)
        self.client.post(self._url_envoyer(self.demande), {}, format="json")

        response = self.client.get(self._url_fdr_pdf(self.demande))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        contenu = b"".join(response.streaming_content)
        self.assertTrue(contenu.startswith(b"%PDF"))

    def test_endpoint_pdf_autre_distributeur_recoit_404(self):
        self._completer_fdr()
        self._authentifier(self.distributeur_a)
        self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self._authentifier(self.distributeur_b)
        response = self.client.get(self._url_fdr_pdf(self.demande))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_endpoint_pdf_absent_retourne_404_coherent(self):
        self._authentifier(self.distributeur_a)

        response = self.client.get(self._url_fdr_pdf(self.demande))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_pdf_liste_les_pieces_transmises(self):
        self._completer_fdr(chantier_atypique=True)
        self._authentifier(self.distributeur_a)
        self.client.post(
            reverse("piece-list", kwargs={"demande_id": self.demande.pk}),
            {"type_piece": PIECE_COMPLEXITE, "fichier": _fichier_upload(nom="justificatif.pdf")},
            format="multipart",
        )

        self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.demande.refresh_from_db()
        contenu = self.demande.fdr_pdf.read()
        self.assertIn(b"justificatif.pdf", contenu)

    def test_pdf_contient_le_commentaire_si_renseigne(self):
        self._completer_fdr()
        self._authentifier(self.distributeur_a)

        self.client.post(
            self._url_envoyer(self.demande),
            {"commentaire_distributeur": "Commentaire visible dans le PDF"},
            format="json",
        )

        self.demande.refresh_from_db()
        contenu = self.demande.fdr_pdf.read()
        # Compression désactivée (pdf.py) : le texte reste inspectable tel quel.
        self.assertIn(b"Commentaire visible dans le PDF", contenu)

    def test_pdf_ne_contient_pas_les_identifiants_techniques_de_categorie(self):
        self._completer_fdr(chantier_atypique=True)
        self._authentifier(self.distributeur_a)
        self.client.post(
            reverse("piece-list", kwargs={"demande_id": self.demande.pk}),
            {"type_piece": PIECE_COMPLEXITE, "fichier": _fichier_upload()},
            format="multipart",
        )

        self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.demande.refresh_from_db()
        contenu = self.demande.fdr_pdf.read()
        # PIECE_COMPLEXITE == "complexite" : l'identifiant technique ne doit
        # jamais apparaître, seul le libellé métier lisible doit être rendu.
        # (reportlab échappe les caractères accentués en séquences octales
        # PDF (`\351` pour é...), donc on vérifie sur la partie sans accent.)
        self.assertNotIn(b"complexite", contenu)
        self.assertIn(b"atypique du", contenu)

    def test_generation_pdf_avec_description_longue_ne_leve_aucune_exception(self):
        self._completer_fdr(intervention_description="Rénovation " * 200)
        self._authentifier(self.distributeur_a)

        response = self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.demande.refresh_from_db()
        self.assertTrue(self.demande.fdr_pdf.read().startswith(b"%PDF"))

    def test_pdf_ne_contient_aucune_information_de_scoring(self):
        self._completer_fdr()
        self._authentifier(self.distributeur_a)

        self.client.post(self._url_envoyer(self.demande), {}, format="json")

        self.demande.refresh_from_db()
        contenu = self.demande.fdr_pdf.read()
        self.assertNotIn(b"Score", contenu)
        self.assertNotIn("indicative".encode("cp1252"), contenu)
