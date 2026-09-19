import io
import uuid

from django.urls import reverse
from pypdf import PdfReader
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur
from ..models import Attestation, DecisionDemande, Demande, DemandeComplement, FormulaireRisque, ProjetAttestation, StatutDemande
from ..html_sanitization import nettoyer_html
from ..projet_attestation import generer_contenu_initial
from .test_projet_attestation import _valeurs_fdr_complet


class AttestationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.distributeur = Utilisateur.objects.create_user(username="agent-attestation", role=Role.DISTRIBUTEUR)
        cls.autre = Utilisateur.objects.create_user(username="autre-agent-attestation", role=Role.DISTRIBUTEUR)
        cls.siege = Utilisateur.objects.create_user(username="siege-attestation", role=Role.SIEGE)
        cls.demande = Demande.objects.create(distributeur=cls.distributeur, statut=StatutDemande.EN_COURS)
        FormulaireRisque.objects.create(demande=cls.demande, **_valeurs_fdr_complet())

    def setUp(self):
        self.client.force_authenticate(self.siege)

    def url(self, action="attestation", demande=None):
        return reverse(f"siege-demande-{action}", kwargs={"pk": (demande or self.demande).pk})

    def preparer(self, demande=None):
        return self.client.post(self.url("preparer-attestation", demande), {}, format="json")

    def verifier_brouillon(self, demande):
        demande.refresh_from_db()
        attestation = Attestation.objects.get(demande=demande)
        self.assertEqual(demande.statut, StatutDemande.EN_COURS)
        self.assertIsNone(demande.decision)
        self.assertEqual(demande.motif_refus, "")
        self.assertIsNone(attestation.validated_at)
        self.assertFalse(attestation.pdf_final)
        self.assertIsNone(self.client.get(self.url(demande=demande)).data["pdf_final"])

    def test_preparation_depuis_fdr_et_get(self):
        response = self.preparer()
        self.assertEqual(response.status_code, 201)
        self.assertIsInstance(uuid.UUID(response.data["id"]), uuid.UUID)
        self.assertEqual(
            response.data["contenu_html"], nettoyer_html(generer_contenu_initial(self.demande.fdr, preparation=True))
        )
        for valeur in ["AXA Construction", "123456789", "Tour Horizon", "Lyon", "10/01/2026", "30/06/2026",
                       "Rénovation complète des bureaux", "100000.00", "50000.00", "Entreprise principale",
                       "Document préparé à partir des informations déclarées dans le formulaire de risque."]:
            self.assertIn(valeur, response.data["contenu_html"])
        self.assertNotIn("Projet établi à partir", response.data["contenu_html"])
        self.assertEqual(self.client.get(self.url()).data, response.data)
        detail = self.client.get(reverse("siege-demande-detail", kwargs={"pk": self.demande.pk}))
        self.assertTrue(detail.data["attestation_existe"])
        self.verifier_brouillon(self.demande)

    def test_preparation_idempotente_conserve_modifications_et_dates(self):
        self.preparer()
        response = self.client.patch(self.url(), {"contenu_html": "<p>Texte siège</p>"}, format="json")
        deuxieme = self.preparer()
        self.assertEqual(deuxieme.status_code, 200)
        self.assertEqual(deuxieme.data, response.data)
        self.assertEqual(Attestation.objects.count(), 1)

    def test_pdf_de_preparation_porte_les_libelles_siege(self):
        self.preparer()

        pdf = self.client.get(self.url("attestation-pdf"))

        texte = "".join(page.extract_text() for page in PdfReader(io.BytesIO(pdf.content)).pages)
        self.assertIn("DOCUMENT DE PRÉVISUALISATION — NON VALIDÉ", texte)
        self.assertIn("Document préparé à partir des informations déclarées dans le formulaire de risque.", texte)
        self.assertNotIn("Projet établi à partir", texte)
        self.assertNotIn("Validation définitive : réservée au siège.", texte)
        self.assertNotIn("PRÉPARATION D'ATTESTATION", texte)
        self.assertNotIn("NON VALIDÉE", texte)

    def test_sans_attestation_get_patch_pdf_404(self):
        self.assertEqual(self.client.get(self.url()).status_code, 404)
        self.assertEqual(self.client.patch(self.url(), {"contenu_html": "texte"}, format="json").status_code, 404)
        self.assertEqual(self.client.get(self.url("attestation-pdf")).status_code, 404)
        self.assertFalse(Attestation.objects.exists())

    def test_patch_sanitization_et_champs_proteges(self):
        initial = self.preparer().data
        response = self.client.patch(self.url(), {
            "contenu_html": '<h2>Titre</h2><p onclick="alert(1)"><strong>Gras</strong><em>Italique</em><u>Souligné</u></p>'
                            '<ul><li>Item</li></ul><script>alert(1)</script><img src="file:///secret">'
                            '<a href="javascript:alert(1)">Lien</a>',
            "id": str(uuid.uuid4()), "demande": str(uuid.uuid4()), "pdf_final": "faux.pdf",
            "validated_at": "2026-09-19T10:00:00Z", "decision": "ACCEPTEE", "statut": "TRAITE",
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], initial["id"])
        self.assertEqual(response.data["demande"], initial["demande"])
        for interdit in ["<script", "<img", "<a ", "onclick", "file://", "javascript:"]:
            self.assertNotIn(interdit, response.data["contenu_html"])
        for autorise in ["<h2>", "<strong>", "<em>", "<u>", "<ul><li>"]:
            self.assertIn(autorise, response.data["contenu_html"])
        self.verifier_brouillon(self.demande)

    def test_complement_actif_autorise(self):
        DemandeComplement.objects.create(demande=self.demande, message="Précisions attendues")
        self.assertEqual(self.preparer().status_code, 201)
        self.verifier_brouillon(self.demande)

    def test_roles_et_ownership_sur_tous_les_endpoints(self):
        self.preparer()
        for utilisateur, attendu in [(self.distributeur, 403), (self.autre, 403), (None, 401)]:
            self.client.force_authenticate(utilisateur)
            for methode, url in [("post", self.url("preparer-attestation")), ("get", self.url()),
                                 ("patch", self.url()), ("get", self.url("attestation-pdf"))]:
                with self.subTest(utilisateur=utilisateur, methode=methode, url=url):
                    self.assertEqual(getattr(self.client, methode)(url).status_code, attendu)

    def test_etats_non_traitables_interdisent_toutes_les_actions(self):
        self.preparer()
        for statut, decision in [(StatutDemande.BROUILLON, None), (StatutDemande.TRAITE, None),
                                  (StatutDemande.TRAITE, DecisionDemande.REFUSEE),
                                  (StatutDemande.EN_COURS, DecisionDemande.REFUSEE),
                                  (StatutDemande.EN_COURS, DecisionDemande.ACCEPTEE)]:
            Demande.objects.filter(pk=self.demande.pk).update(statut=statut, decision=decision)
            for methode, url in [("post", self.url("preparer-attestation")), ("get", self.url()),
                                 ("patch", self.url()), ("get", self.url("attestation-pdf"))]:
                with self.subTest(statut=statut, decision=decision, methode=methode, url=url):
                    self.assertEqual(getattr(self.client, methode)(url).status_code, 409)

    def test_smoke_avec_et_sans_projet_independants(self):
        autre_demande = Demande.objects.create(distributeur=self.autre, statut=StatutDemande.EN_COURS)
        FormulaireRisque.objects.create(demande=autre_demande, **_valeurs_fdr_complet())
        projet = ProjetAttestation.objects.create(demande=self.demande, contenu_html="<p>HTML DISTRIBUTEUR EXCLU</p>")
        contenus = []
        for demande in [self.demande, autre_demande]:
            with self.subTest(avec_projet=demande == self.demande):
                creation = self.preparer(demande)
                self.assertEqual(creation.status_code, 201)
                contenus.append(creation.data["contenu_html"])
                self.assertNotIn("HTML DISTRIBUTEUR EXCLU", contenus[-1])
                self.assertEqual(self.preparer(demande).data, creation.data)
                self.assertEqual(self.client.patch(self.url(demande=demande), {
                    "contenu_html": "<p>Modification siège enregistrée</p>"
                }, format="json").status_code, 200)
                for _ in range(2):
                    pdf = self.client.get(self.url("attestation-pdf", demande))
                    self.assertEqual(pdf.status_code, 200)
                    self.assertEqual(pdf["Content-Type"], "application/pdf")
                    self.assertTrue(pdf.content.startswith(b"%PDF"))
                    self.assertIn("preparation-attestation-", pdf["Content-Disposition"])
                    texte = "".join(page.extract_text() for page in PdfReader(io.BytesIO(pdf.content)).pages)
                    for attendu in ["DOCUMENT DE PRÉVISUALISATION — NON VALIDÉ", "ATTESTATION D'ASSURANCE",
                                    "Modification siège enregistrée", "AXA Construction", "123456789"]:
                        self.assertIn(attendu, texte)
                    self.assertNotIn("PRÉPARATION D'ATTESTATION", texte)
                    self.assertNotIn("NON VALIDÉE", texte)
                    self.assertNotIn("HTML DISTRIBUTEUR EXCLU", texte)
                self.verifier_brouillon(demande)
        self.assertEqual(contenus[0], contenus[1])
        projet.refresh_from_db()
        self.assertEqual(projet.contenu_html, "<p>HTML DISTRIBUTEUR EXCLU</p>")
        self.assertFalse(ProjetAttestation.objects.filter(demande=autre_demande).exists())
