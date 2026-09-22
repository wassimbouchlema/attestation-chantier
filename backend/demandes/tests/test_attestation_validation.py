import io
import shutil
import tempfile
from unittest import mock

from django.test import override_settings
from django.urls import reverse
from pypdf import PdfReader
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur
from ..models import (
    Attestation,
    DecisionDemande,
    Demande,
    DemandeComplement,
    FormulaireRisque,
    Notification,
    StatutDemande,
    TypeNotification,
)
from .test_projet_attestation import _valeurs_fdr_complet

MEDIA_TEST = tempfile.mkdtemp(prefix="attestation-tests-")


def texte_pdf(contenu):
    return " ".join(page.extract_text() for page in PdfReader(io.BytesIO(contenu)).pages)


@override_settings(MEDIA_ROOT=MEDIA_TEST)
class ValidationAttestationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.distributeur = Utilisateur.objects.create_user(username="agent-validation", role=Role.DISTRIBUTEUR)
        cls.autre = Utilisateur.objects.create_user(username="autre-validation", role=Role.DISTRIBUTEUR)
        cls.siege = Utilisateur.objects.create_user(username="siege-validation", role=Role.SIEGE)

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_TEST, ignore_errors=True)

    def setUp(self):
        self.demande = Demande.objects.create(distributeur=self.distributeur, statut=StatutDemande.EN_COURS)
        FormulaireRisque.objects.create(demande=self.demande, **_valeurs_fdr_complet())
        self.client.force_authenticate(self.siege)
        self.client.post(reverse("siege-demande-preparer-attestation", kwargs={"pk": self.demande.pk}), {}, format="json")
        self.attestation = Attestation.objects.get(demande=self.demande)
        self.attestation.contenu_html += "<p>Clause ajoutée par le siège</p>"
        self.attestation.save()

    def valider(self, demande=None):
        return self.client.post(
            reverse("siege-demande-valider-attestation", kwargs={"pk": (demande or self.demande).pk}), {}, format="json"
        )

    def url_pdf(self, demande=None):
        return reverse("demande-attestation-finale-pdf", kwargs={"pk": (demande or self.demande).pk})

    def verifier_non_valide(self):
        self.demande.refresh_from_db()
        self.attestation.refresh_from_db()
        self.assertEqual(self.demande.statut, StatutDemande.EN_COURS)
        self.assertIsNone(self.demande.decision)
        self.assertIsNone(self.attestation.validated_at)
        self.assertFalse(self.attestation.pdf_final)
        self.assertFalse(Notification.objects.filter(type_notification=TypeNotification.DEMANDE_ACCEPTEE).exists())

    def test_validation_fige_le_pdf_et_notifie(self):
        response = self.valider()
        self.assertEqual(response.status_code, 200)
        self.demande.refresh_from_db()
        self.attestation.refresh_from_db()
        self.assertEqual(self.demande.decision, DecisionDemande.ACCEPTEE)
        self.assertEqual(self.demande.statut, StatutDemande.TRAITE)
        self.assertIsNotNone(self.attestation.validated_at)
        contenu = self.attestation.pdf_final.open("rb").read()
        self.assertTrue(contenu.startswith(b"%PDF"))
        texte = texte_pdf(contenu)
        self.assertIn("Clause ajoutée par le siège", texte)
        self.assertNotIn("NON VALIDÉ", texte)
        self.assertNotIn("PRÉVISUALISATION", texte)
        self.assertNotIn("NON DÉFINITIF", texte)
        self.assertNotIn("PROJET D'ATTESTATION", texte.upper())
        self.assertNotIn("réservée au siège", texte)
        self.assertNotIn("sous réserve", texte)
        self.assertIn("Assurance et Banque", texte)
        self.assertIn("ATTESTATION D'ASSURANCE", texte)
        notification = Notification.objects.get(type_notification=TypeNotification.DEMANDE_ACCEPTEE)
        self.assertEqual(notification.destinataire, self.distributeur)
        self.assertEqual(notification.demande, self.demande)
        self.assertIsNone(notification.seen_at)

    def test_deuxieme_validation_refusee(self):
        self.assertEqual(self.valider().status_code, 200)
        response = self.valider()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "ATTESTATION_DEJA_VALIDEE")
        self.assertEqual(Notification.objects.filter(type_notification=TypeNotification.DEMANDE_ACCEPTEE).count(), 1)

    def test_attestation_validee_immuable(self):
        self.valider()
        url = reverse("siege-demande-attestation", kwargs={"pk": self.demande.pk})
        self.assertEqual(self.client.patch(url, {"contenu_html": "<p>Modifié</p>"}, format="json").status_code, 409)
        preparer = self.client.post(
            reverse("siege-demande-preparer-attestation", kwargs={"pk": self.demande.pk}), {}, format="json"
        )
        self.assertEqual(preparer.status_code, 409)
        self.attestation.refresh_from_db()
        self.assertIn("Clause ajoutée par le siège", self.attestation.contenu_html)

    def test_validation_sans_attestation(self):
        autre = Demande.objects.create(distributeur=self.distributeur, statut=StatutDemande.EN_COURS)
        FormulaireRisque.objects.create(demande=autre, **_valeurs_fdr_complet())
        self.assertEqual(self.valider(autre).status_code, 404)
        autre.refresh_from_db()
        self.assertIsNone(autre.decision)

    def test_validation_attestation_vide(self):
        self.attestation.contenu_html = "   "
        self.attestation.save()
        response = self.valider()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "ATTESTATION_VIDE")
        self.verifier_non_valide()

    def test_demande_deja_traitee(self):
        Demande.objects.filter(pk=self.demande.pk).update(statut=StatutDemande.TRAITE, decision=DecisionDemande.REFUSEE)
        response = self.valider()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "DEMANDE_NON_TRAITABLE")
        self.attestation.refresh_from_db()
        self.assertFalse(self.attestation.pdf_final)

    def test_complement_existant_ne_bloque_pas(self):
        DemandeComplement.objects.create(demande=self.demande, message="Précisez")
        self.assertEqual(self.valider().status_code, 200)

    def test_roles_et_anonyme(self):
        self.client.force_authenticate(self.distributeur)
        self.assertEqual(self.valider().status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.valider().status_code, 401)
        self.verifier_non_valide()

    def test_telechargement_pdf_final(self):
        self.valider()
        self.client.force_authenticate(self.distributeur)
        response = self.client.get(self.url_pdf())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn(f"attestation-definitive-{self.demande.id}.pdf", response["Content-Disposition"])
        self.assertTrue(b"".join(response.streaming_content).startswith(b"%PDF"))
        detail = self.client.get(reverse("demande-detail", kwargs={"pk": self.demande.pk}))
        self.assertEqual(detail.data["decision"], DecisionDemande.ACCEPTEE)
        self.assertIsNotNone(detail.data["attestation_finale"]["validated_at"])

    def test_telechargement_pdf_final_refuse(self):
        self.valider()
        self.client.force_authenticate(self.autre)
        self.assertEqual(self.client.get(self.url_pdf()).status_code, 404)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.url_pdf()).status_code, 401)

    def test_pas_de_pdf_final_avant_validation_ni_apres_refus(self):
        self.client.force_authenticate(self.distributeur)
        self.assertEqual(self.client.get(self.url_pdf()).status_code, 404)
        self.client.force_authenticate(self.siege)
        self.client.post(
            reverse("siege-demande-refuser", kwargs={"pk": self.demande.pk}), {"motif": "Risque hors périmètre"}, format="json"
        )
        self.client.force_authenticate(self.distributeur)
        self.assertEqual(self.client.get(self.url_pdf()).status_code, 404)
        detail = self.client.get(reverse("demande-detail", kwargs={"pk": self.demande.pk}))
        self.assertIsNone(detail.data["attestation_finale"])

    def test_echec_generation_pdf(self):
        with mock.patch("demandes.views.siege.generer_pdf", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.valider()
        self.verifier_non_valide()

    def test_echec_apres_ecriture_supprime_le_fichier(self):
        stockage = Attestation._meta.get_field("pdf_final").storage
        with mock.patch("demandes.views.siege.Notification.objects.create", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.valider()
        self.verifier_non_valide()
        self.assertFalse(stockage.exists(f"attestations/attestation-definitive-{self.demande.id}.pdf"))

    def test_analyse_ia_n_influence_pas_la_decision(self):
        url = reverse("siege-demande-analyser-coherence-attestation", kwargs={"pk": self.demande.pk})
        self.assertEqual(self.client.post(url).status_code, 200)
        self.verifier_non_valide()
        self.assertEqual(self.valider().status_code, 200)
