import json
from decimal import Decimal
from unittest.mock import patch

import httpx
from django.test import SimpleTestCase, override_settings
from mistralai.client import Mistral

from ..extracteur_fdr import (
    DocumentAExtraire,
    ExtractionDocumentIndisponible,
    FakeExtracteurFdr,
    MistralExtracteurFdr,
    obtenir_extracteur_fdr,
)
from ..extraction_fdr import ChampExtractibleFdr, get_args

TOUS_LES_CHAMPS = list(get_args(ChampExtractibleFdr))

PDF_FACTICE = b"%PDF-1.4 contenu factice"


def _document_pdf(contenu=PDF_FACTICE, type_mime="application/pdf", nom_fichier="devis.pdf"):
    return DocumentAExtraire(contenu=contenu, type_mime=type_mime, nom_fichier=nom_fichier)


def _reponse_ocr(document_annotation, model="mistral-ocr-test"):
    return {
        "pages": [{"index": 0, "markdown": "", "images": [], "dimensions": None}],
        "model": model,
        "usage_info": {"pages_processed": 1},
        "document_annotation": document_annotation,
    }


@override_settings(
    DOCUMENT_EXTRACTION_BACKEND="mistral", MISTRAL_API_KEY="cle-factice", MISTRAL_DOCUMENT_MODEL="modele-test"
)
class MistralExtracteurFdrTests(SimpleTestCase):
    def setUp(self):
        self.requetes = []
        self.status = 200
        self.corps = _reponse_ocr(json.dumps({"champs_non_trouves": []}))
        self.erreur_transport = None
        self.provider = patch("demandes.extracteur_fdr.Mistral", side_effect=self._creer_client).start()
        self.addCleanup(patch.stopall)
        self.extracteur = MistralExtracteurFdr()

    def _creer_client(self, **kwargs):
        return Mistral(**kwargs, client=httpx.Client(transport=httpx.MockTransport(self._repondre)))

    def _repondre(self, request):
        if self.erreur_transport:
            raise self.erreur_transport
        self.requetes.append(json.loads(request.content))
        return httpx.Response(self.status, json=self.corps)

    def test_extraction_valide_retourne_resultat_extraction_fdr(self):
        annotation = {
            "assure_nom": {"valeur": "Jean Dupont", "confiance": 0.9, "page": 1},
            "date_debut": {"valeur": "2026-01-05", "confiance": 0.8},
            "montant_total": {"valeur": "500000.00", "confiance": 0.7},
            "champs_non_trouves": [
                "assure_ville", "assure_numero_contrat", "chantier_nom", "chantier_ville",
                "type_chantier", "usage", "usage_autre_texte", "date_fin",
                "intervention_description", "intervention_montant_prestation", "intervention_type",
            ],
        }
        self.corps = _reponse_ocr(json.dumps(annotation))

        resultat = self.extracteur.extraire(_document_pdf())

        self.assertEqual(resultat.assure_nom.valeur, "Jean Dupont")
        self.assertEqual(str(resultat.montant_total.valeur), "500000.00")
        self.assertEqual(resultat.date_debut.valeur.isoformat(), "2026-01-05")

        requete = self.requetes[0]
        self.assertEqual(requete["model"], "modele-test")
        self.assertTrue(requete["document"]["document_url"].startswith("data:application/pdf;base64,"))
        self.assertEqual(requete["document_annotation_format"]["type"], "json_schema")
        self.assertFalse(requete["document_annotation_format"]["json_schema"]["schema"]["additionalProperties"])
        self.assertIn("document_annotation_prompt", requete)

    def test_montants_exposes_a_mistral_comme_type_number_simple(self):
        self.corps = _reponse_ocr(json.dumps({"champs_non_trouves": TOUS_LES_CHAMPS}))

        self.extracteur.extraire(_document_pdf())

        schema = self.requetes[0]["document_annotation_format"]["json_schema"]["schema"]
        for champ in ("montant_total", "intervention_montant_prestation"):
            with self.subTest(champ=champ):
                ref = next(branche["$ref"] for branche in schema["properties"][champ]["anyOf"] if "$ref" in branche)
                nom_def = ref.split("/")[-1]
                schema_valeur = schema["$defs"][nom_def]["properties"]["valeur"]
                self.assertEqual(schema_valeur, {"title": "Valeur", "type": "number"})

    def test_document_vide_rejete_sans_appel_reseau(self):
        with self.assertRaises(ValueError):
            self.extracteur.extraire(_document_pdf(contenu=b""))
        self.provider.assert_not_called()

    def test_mime_non_pdf_rejete_sans_appel_reseau(self):
        with self.assertRaises(ValueError):
            self.extracteur.extraire(_document_pdf(type_mime="image/png"))
        self.provider.assert_not_called()

    @override_settings(MISTRAL_API_KEY="")
    def test_cle_api_absente_sans_appel_reseau(self):
        with self.assertRaises(ExtractionDocumentIndisponible):
            self.extracteur.extraire(_document_pdf())
        self.provider.assert_not_called()

    def test_reponse_vide(self):
        self.corps = _reponse_ocr(None)
        with self.assertRaises(ExtractionDocumentIndisponible):
            self.extracteur.extraire(_document_pdf())

    def test_resultat_structure_invalide(self):
        for annotation in ["pas du JSON", json.dumps({"assure_nom": "Jean Dupont"})]:
            with self.subTest(annotation=annotation):
                self.corps = _reponse_ocr(annotation)
                with self.assertRaises(ExtractionDocumentIndisponible):
                    self.extracteur.extraire(_document_pdf())

    def test_normalise_un_champ_null_oublie_dans_champs_non_trouves(self):
        annotation = {
            "assure_nom": {"valeur": "Jean Dupont", "confiance": 0.9},
            "chantier_ville": None,
            "champs_non_trouves": [c for c in TOUS_LES_CHAMPS if c not in ("assure_nom", "chantier_ville")],
        }
        self.corps = _reponse_ocr(json.dumps(annotation))

        resultat = self.extracteur.extraire(_document_pdf())

        self.assertIn("chantier_ville", resultat.champs_non_trouves)
        self.assertIsNone(resultat.chantier_ville)
        self.assertEqual(resultat.assure_nom.valeur, "Jean Dupont")

    def test_normalise_un_champ_totalement_absent_du_json(self):
        annotation = {"assure_nom": {"valeur": "Jean Dupont", "confiance": 0.9}}
        self.corps = _reponse_ocr(json.dumps(annotation))

        resultat = self.extracteur.extraire(_document_pdf())

        self.assertIn("chantier_ville", resultat.champs_non_trouves)
        self.assertIsNone(resultat.chantier_ville)
        for champ in TOUS_LES_CHAMPS:
            if champ != "assure_nom":
                self.assertIn(champ, resultat.champs_non_trouves)

    def test_normalise_un_champ_trouve_mais_liste_a_tort_dans_champs_non_trouves(self):
        annotation = {
            "montant_total": {"valeur": 500000.00, "confiance": 0.7},
            "champs_non_trouves": TOUS_LES_CHAMPS,
        }
        self.corps = _reponse_ocr(json.dumps(annotation))

        resultat = self.extracteur.extraire(_document_pdf())

        self.assertNotIn("montant_total", resultat.champs_non_trouves)
        self.assertEqual(resultat.montant_total.valeur, Decimal("500000.00"))

    def test_normalise_plusieurs_champs_manquants_simultanement(self):
        self.corps = _reponse_ocr(json.dumps({}))

        resultat = self.extracteur.extraire(_document_pdf())

        self.assertEqual(sorted(resultat.champs_non_trouves), sorted(TOUS_LES_CHAMPS))
        for champ in TOUS_LES_CHAMPS:
            self.assertIsNone(getattr(resultat, champ))

    def test_normalisation_neutre_sur_un_resultat_deja_coherent(self):
        annotation = {
            "assure_nom": {"valeur": "Jean Dupont", "confiance": 0.9},
            "montant_total": {"valeur": 500000.00, "confiance": 0.7},
            "champs_non_trouves": [c for c in TOUS_LES_CHAMPS if c not in ("assure_nom", "montant_total")],
        }
        self.corps = _reponse_ocr(json.dumps(annotation))

        resultat = self.extracteur.extraire(_document_pdf())

        self.assertEqual(resultat.assure_nom.valeur, "Jean Dupont")
        self.assertEqual(resultat.montant_total.valeur, Decimal("500000.00"))
        self.assertEqual(
            sorted(resultat.champs_non_trouves),
            sorted(c for c in TOUS_LES_CHAMPS if c not in ("assure_nom", "montant_total")),
        )

    def test_timeout(self):
        self.erreur_transport = httpx.ReadTimeout("secret-timeout")
        with self.assertRaises(ExtractionDocumentIndisponible):
            self.extracteur.extraire(_document_pdf())

    def test_erreur_reseau(self):
        self.erreur_transport = httpx.ConnectError("secret-connect")
        with self.assertRaises(ExtractionDocumentIndisponible):
            self.extracteur.extraire(_document_pdf())

    def test_erreurs_http_fournisseur(self):
        for code in [401, 429, 500]:
            with self.subTest(code=code):
                self.status = code
                with self.assertRaises(ExtractionDocumentIndisponible):
                    self.extracteur.extraire(_document_pdf())

    def test_message_erreur_ne_fuit_aucune_donnee_sensible(self):
        self.status = 500
        self.corps = {"detail": "SECRET_BODY_MISTRAL"}
        with self.assertRaises(ExtractionDocumentIndisponible) as cm:
            self.extracteur.extraire(_document_pdf(contenu=b"%PDF-1.4 CONTENU_PDF_SECRET"))
        message = str(cm.exception)
        self.assertNotIn("cle-factice", message)
        self.assertNotIn("SECRET_BODY_MISTRAL", message)
        self.assertNotIn("CONTENU_PDF_SECRET", message)


class ObtenirExtracteurFdrMistralTests(SimpleTestCase):
    @override_settings(DOCUMENT_EXTRACTION_BACKEND="mistral")
    def test_backend_mistral_retourne_mistral_extracteur(self):
        extracteur = obtenir_extracteur_fdr()
        self.assertIsInstance(extracteur, MistralExtracteurFdr)
        self.assertNotIsInstance(extracteur, FakeExtracteurFdr)
