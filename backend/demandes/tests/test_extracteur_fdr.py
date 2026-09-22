from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from ..extracteur_fdr import (
    DocumentAExtraire,
    ExtracteurDocumentFdr,
    FakeExtracteurFdr,
    obtenir_extracteur_fdr,
)
from ..extraction_fdr import ChampExtraitTexte, ChampExtractibleFdr, ResultatExtractionFdr, get_args

TOUS_LES_CHAMPS = list(get_args(ChampExtractibleFdr))


def _document_pdf(contenu=b"%PDF-1.4 contenu factice"):
    return DocumentAExtraire(contenu=contenu, type_mime="application/pdf", nom_fichier="devis.pdf")


class ExtracteurDocumentFdrProtocolTests(SimpleTestCase):
    def test_fake_est_conforme_au_protocol(self):
        self.assertIsInstance(FakeExtracteurFdr(), ExtracteurDocumentFdr)

    def test_objet_sans_methode_extraire_non_conforme(self):
        class PasUnExtracteur:
            pass

        self.assertNotIsInstance(PasUnExtracteur(), ExtracteurDocumentFdr)

    def test_document_a_extraire_porte_contenu_et_type_mime(self):
        document = _document_pdf()
        self.assertEqual(document.type_mime, "application/pdf")
        self.assertEqual(document.nom_fichier, "devis.pdf")
        self.assertIsInstance(document.contenu, bytes)


class FakeExtracteurFdrTests(SimpleTestCase):
    def test_resultat_par_defaut_est_entierement_non_trouve(self):
        resultat = FakeExtracteurFdr().extraire(_document_pdf())
        self.assertIsInstance(resultat, ResultatExtractionFdr)
        self.assertEqual(sorted(resultat.champs_non_trouves), sorted(TOUS_LES_CHAMPS))
        for champ in TOUS_LES_CHAMPS:
            self.assertIsNone(getattr(resultat, champ))

    def test_retourne_le_resultat_fourni_sans_lire_le_document(self):
        resultat_attendu = ResultatExtractionFdr(
            assure_nom=ChampExtraitTexte(valeur="Jean Dupont", confiance=0.9),
            champs_non_trouves=[champ for champ in TOUS_LES_CHAMPS if champ != "assure_nom"],
        )
        extracteur = FakeExtracteurFdr(resultat=resultat_attendu)
        resultat = extracteur.extraire(_document_pdf(contenu=b"n'importe quoi"))

        self.assertEqual(resultat, resultat_attendu)
        self.assertIs(resultat, resultat_attendu)

    def test_resultat_stable_sur_plusieurs_appels(self):
        extracteur = FakeExtracteurFdr()
        premier = extracteur.extraire(_document_pdf())
        second = extracteur.extraire(_document_pdf(contenu=b"autre contenu"))
        self.assertEqual(premier, second)


class ObtenirExtracteurFdrTests(SimpleTestCase):
    @override_settings(DOCUMENT_EXTRACTION_BACKEND="fake")
    def test_backend_fake_retourne_le_fake(self):
        extracteur = obtenir_extracteur_fdr()
        self.assertIsInstance(extracteur, FakeExtracteurFdr)

    @override_settings(DOCUMENT_EXTRACTION_BACKEND="mistral")
    def test_backend_mistral_non_implemente_echoue_explicitement(self):
        with self.assertRaises(NotImplementedError):
            obtenir_extracteur_fdr()

    @override_settings(DOCUMENT_EXTRACTION_BACKEND="azure-document-intelligence")
    def test_backend_inconnu_echoue_explicitement(self):
        with self.assertRaises(ValueError):
            obtenir_extracteur_fdr()


class AucunEffetDeBordTests(SimpleTestCase):
    """`SimpleTestCase` interdit déjà tout accès DB ; on vérifie ici,
    explicitement, l'absence de toute tentative de connexion réseau."""

    def test_fake_extraire_sans_reseau(self):
        with patch("socket.socket.connect", side_effect=AssertionError("accès réseau inattendu")):
            resultat = FakeExtracteurFdr().extraire(_document_pdf())
        self.assertIsInstance(resultat, ResultatExtractionFdr)

    @override_settings(DOCUMENT_EXTRACTION_BACKEND="fake")
    def test_factory_et_extraction_sans_reseau(self):
        with patch("socket.socket.connect", side_effect=AssertionError("accès réseau inattendu")):
            extracteur = obtenir_extracteur_fdr()
            extracteur.extraire(_document_pdf())
