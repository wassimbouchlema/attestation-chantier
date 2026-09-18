import io
from datetime import date
from decimal import Decimal

from pypdf import PdfReader

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur

from ..models import Demande, FormulaireRisque, ProjetAttestation, StatutDemande, TypeChantier, TypeIntervention, Usage
from ..projet_attestation_pdf import construire_html


def _valeurs_fdr_complet(**overrides):
    valeurs = dict(
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
        intervention_description="Rénovation complète des bureaux",
        intervention_montant_prestation=Decimal("50000.00"),
        intervention_type=TypeIntervention.PRINCIPALE,
        activite_couverte=True,
        travaux_standards=True,
    )
    valeurs.update(overrides)
    return valeurs


class ProjetAttestationEndpointTests(APITestCase):
    def setUp(self):
        self.distributeur_a = Utilisateur.objects.create_user(
            username="distributeur_projet_a", password="test1234", role=Role.DISTRIBUTEUR
        )
        self.distributeur_b = Utilisateur.objects.create_user(
            username="distributeur_projet_b", password="test1234", role=Role.DISTRIBUTEUR
        )
        self.siege = Utilisateur.objects.create_user(
            username="siege_projet", password="test1234", role=Role.SIEGE
        )
        self.demande_en_cours = Demande.objects.create(
            distributeur=self.distributeur_a, statut=StatutDemande.EN_COURS
        )
        FormulaireRisque.objects.create(demande=self.demande_en_cours, **_valeurs_fdr_complet())

    def _authentifier(self, utilisateur):
        response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": utilisateur.username, "password": "test1234"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _url(self, demande=None):
        return reverse("demande-projet-attestation", kwargs={"pk": (demande or self.demande_en_cours).pk})

    # --- Création ---

    def test_creation_reussie_pour_demande_en_cours(self):
        self._authentifier(self.distributeur_a)

        response = self.client.post(self._url(), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ProjetAttestation.objects.filter(pk=self.demande_en_cours.pk).exists())
        contenu = response.data["contenu_html"]
        self.assertIn("AXA Construction", contenu)
        self.assertIn("123456789", contenu)
        self.assertIn("Tour Horizon", contenu)
        self.assertIn("Lyon", contenu)
        self.assertIn("Construction neuve", contenu)
        self.assertIn("10/01/2026", contenu)
        self.assertIn("30/06/2026", contenu)
        self.assertIn("Rénovation complète des bureaux", contenu)
        self.assertIn("100000.00", contenu)
        self.assertIn("50000.00", contenu)
        self.assertIn("Entreprise principale", contenu)

    def test_contenu_initial_ne_contient_que_le_corps_editable(self):
        """Le gabarit fixe (titres, en-tête, pied de page) est rendu autour de
        la zone éditable : le dupliquer dans `contenu_html` afficherait deux
        fois les mêmes titres dans le document."""
        self._authentifier(self.distributeur_a)

        contenu = self.client.post(self._url(), {}, format="json").data["contenu_html"]

        self.assertNotIn("PROJET D'ATTESTATION", contenu.upper())
        self.assertNotIn("ATTESTATION D'ASSURANCE", contenu.upper())
        self.assertNotIn("NON DÉFINITIF", contenu.upper())
        self.assertNotIn("réservée au siège", contenu)
        self.assertNotIn("Votre agent général", contenu)
        self.assertNotIn("Vos références", contenu)
        self.assertNotIn("<h1", contenu)
        self.assertNotIn("logo", contenu.lower())

    def test_deuxieme_creation_refusee_409(self):
        self._authentifier(self.distributeur_a)
        self.client.post(self._url(), {}, format="json")

        response = self.client.post(self._url(), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "PROJET_DEJA_EXISTANT")
        self.assertEqual(ProjetAttestation.objects.filter(pk=self.demande_en_cours.pk).count(), 1)

    def test_creation_refusee_pour_brouillon(self):
        demande_brouillon = Demande.objects.create(distributeur=self.distributeur_a, statut=StatutDemande.BROUILLON)
        FormulaireRisque.objects.create(demande=demande_brouillon)
        self._authentifier(self.distributeur_a)

        response = self.client.post(self._url(demande_brouillon), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "PROJET_NON_AUTORISE")
        self.assertFalse(ProjetAttestation.objects.filter(pk=demande_brouillon.pk).exists())

    def test_creation_refusee_pour_traite(self):
        demande_traitee = Demande.objects.create(distributeur=self.distributeur_a, statut=StatutDemande.TRAITE)
        FormulaireRisque.objects.create(demande=demande_traitee, **_valeurs_fdr_complet())
        self._authentifier(self.distributeur_a)

        response = self.client.post(self._url(demande_traitee), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "PROJET_NON_AUTORISE")

    # --- Lecture ---

    def test_get_projet_par_le_proprietaire(self):
        self._authentifier(self.distributeur_a)
        self.client.post(self._url(), {}, format="json")

        response = self.client.get(self._url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("AXA Construction", response.data["contenu_html"])

    def test_get_sans_projet_retourne_404(self):
        self._authentifier(self.distributeur_a)

        response = self.client.get(self._url())

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_get_projet_autre_distributeur_retourne_404(self):
        self._authentifier(self.distributeur_a)
        self.client.post(self._url(), {}, format="json")

        self._authentifier(self.distributeur_b)
        response = self.client.get(self._url())

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_get_projet_reste_consultable_une_fois_traite(self):
        self._authentifier(self.distributeur_a)
        self.client.post(self._url(), {}, format="json")
        self.demande_en_cours.statut = StatutDemande.TRAITE
        self.demande_en_cours.save(update_fields=["statut"])

        response = self.client.get(self._url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # --- Rôles / anonymat ---

    def test_siege_recoit_403(self):
        self._authentifier(self.siege)

        response = self.client.post(self._url(), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonyme_recoit_401(self):
        response = self.client.get(self._url())

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # --- Modification ---

    def test_patch_sauvegarde_le_contenu(self):
        self._authentifier(self.distributeur_a)
        self.client.post(self._url(), {}, format="json")

        response = self.client.patch(
            self._url(), {"contenu_html": "<p>Texte modifié par le distributeur.</p>"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["contenu_html"], "<p>Texte modifié par le distributeur.</p>")
        projet = ProjetAttestation.objects.get(pk=self.demande_en_cours.pk)
        self.assertEqual(projet.contenu_html, "<p>Texte modifié par le distributeur.</p>")

    def test_patch_sans_projet_retourne_404(self):
        self._authentifier(self.distributeur_a)

        response = self.client.patch(self._url(), {"contenu_html": "<p>Test</p>"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_patch_html_dangereux_est_sanitize(self):
        self._authentifier(self.distributeur_a)
        self.client.post(self._url(), {}, format="json")
        contenu_malveillant = (
            '<p onclick="alert(1)">Texte</p>'
            "<script>alert('xss')</script>"
            '<img src="x" onerror="alert(1)">'
            '<a href="javascript:alert(1)">lien</a>'
        )

        response = self.client.patch(self._url(), {"contenu_html": contenu_malveillant}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        contenu_sauvegarde = response.data["contenu_html"]
        self.assertNotIn("<script", contenu_sauvegarde)
        self.assertNotIn("onclick", contenu_sauvegarde)
        self.assertNotIn("onerror", contenu_sauvegarde)
        self.assertNotIn("javascript:", contenu_sauvegarde)
        self.assertNotIn("<img", contenu_sauvegarde)
        self.assertNotIn("<a ", contenu_sauvegarde)
        self.assertIn("Texte", contenu_sauvegarde)

    def test_patch_conserve_les_balises_autorisees(self):
        self._authentifier(self.distributeur_a)
        self.client.post(self._url(), {}, format="json")
        contenu_riche = "<h2>Titre</h2><p><strong>Gras</strong> <em>italique</em> <u>souligné</u></p><ul><li>Item</li></ul>"

        response = self.client.patch(self._url(), {"contenu_html": contenu_riche}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["contenu_html"], contenu_riche)


class ProjetAttestationPdfTests(APITestCase):
    """Le PDF est rendu à la demande à partir du `contenu_html` enregistré
    (déjà sanitizé), jamais stocké ni repris d'un HTML transmis par le client."""

    def setUp(self):
        self.distributeur_a = Utilisateur.objects.create_user(
            username="distributeur_pdf_a", password="test1234", role=Role.DISTRIBUTEUR
        )
        self.distributeur_b = Utilisateur.objects.create_user(
            username="distributeur_pdf_b", password="test1234", role=Role.DISTRIBUTEUR
        )
        self.demande = Demande.objects.create(distributeur=self.distributeur_a, statut=StatutDemande.EN_COURS)
        FormulaireRisque.objects.create(demande=self.demande, **_valeurs_fdr_complet())

    def _authentifier(self, utilisateur):
        response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": utilisateur.username, "password": "test1234"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _url_pdf(self, demande=None):
        return reverse("demande-projet-attestation-pdf", kwargs={"pk": (demande or self.demande).pk})

    def _url_projet(self, demande=None):
        return reverse("demande-projet-attestation", kwargs={"pk": (demande or self.demande).pk})

    def _creer_projet(self):
        self.assertEqual(
            self.client.post(self._url_projet(), {}, format="json").status_code, status.HTTP_201_CREATED
        )

    def test_pdf_genere_pour_un_projet_existant(self):
        self._authentifier(self.distributeur_a)
        self._creer_projet()

        response = self.client.get(self._url_pdf())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        contenu = b"".join(response.streaming_content) if response.streaming else response.content
        self.assertTrue(contenu.startswith(b"%PDF"))

    def test_pdf_sans_projet_retourne_404(self):
        self._authentifier(self.distributeur_a)

        response = self.client.get(self._url_pdf())

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_pdf_autre_distributeur_retourne_404(self):
        self._authentifier(self.distributeur_a)
        self._creer_projet()
        self._authentifier(self.distributeur_b)

        response = self.client.get(self._url_pdf())

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_pdf_anonyme_retourne_401(self):
        response = self.client.get(self._url_pdf())

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_pdf_reprend_le_contenu_sanitize_enregistre(self):
        self._authentifier(self.distributeur_a)
        self._creer_projet()
        self.client.patch(
            self._url_projet(),
            {"contenu_html": "<p>Texte conservé</p><script>alert('xss')</script>"},
            format="json",
        )

        html = construire_html(self.demande, self.demande.projet_attestation.contenu_html)

        # `nettoyer_html` retire la balise et conserve son texte (choix
        # documenté) : le PDF ne peut donc contenir qu'un texte inerte, jamais
        # une balise exécutable.
        self.assertIn("Texte conservé", html)
        self.assertNotIn("<script", html)
        self.assertNotIn("onerror", html)

    def test_html_du_pdf_porte_le_gabarit_fixe_et_les_donnees_du_fdr(self):
        self._authentifier(self.distributeur_a)
        self._creer_projet()

        html = construire_html(self.demande, self.demande.projet_attestation.contenu_html)

        for attendu in [
            "Votre agent général",
            "Votre contrat",
            "Vos références",
            "Assuré",
            "Date du courrier",
            "Objet",
            "PROJET D'ATTESTATION",
            "NON DÉFINITIF",
            "ATTESTATION D'ASSURANCE",
            "Validation définitive : réservée au siège.",
            "123456789",
            "AXA Construction",
            "Tour Horizon",
            "logo-axa.svg",
        ]:
            self.assertIn(attendu, html)

    def test_pdf_contient_le_texte_du_document(self):
        """Vérification du rendu réel (pas du CSS) : le texte métier et le
        marquage « non définitif » doivent être lisibles dans le PDF."""
        self._authentifier(self.distributeur_a)
        self._creer_projet()

        contenu = self.client.get(self._url_pdf()).content
        texte = "".join(page.extract_text() for page in PdfReader(io.BytesIO(contenu)).pages)

        self.assertIn("PROJET D'ATTESTATION", texte)
        self.assertIn("NON DÉFINITIF", texte)
        self.assertIn("ATTESTATION D'ASSURANCE", texte)
        self.assertIn("AXA Construction", texte)
        self.assertIn("réservée au siège", texte)
