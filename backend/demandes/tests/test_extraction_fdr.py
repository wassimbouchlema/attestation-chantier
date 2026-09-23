import json
from datetime import date
from decimal import Decimal

from django.test import SimpleTestCase
from pydantic import ValidationError

from ..extraction_fdr import (
    ChampExtraitDate,
    ChampExtraitMontant,
    ChampExtraitTexte,
    ChampExtraitTypeChantier,
    ChampExtraitTypeIntervention,
    ChampExtraitUsage,
    ChampExtractibleFdr,
    ResultatExtractionFdr,
    ValeurExtraite,
    get_args,
)

TOUS_LES_CHAMPS = list(get_args(ChampExtractibleFdr))


def _resultat_vide(**champs_trouves):
    """Construit un ResultatExtractionFdr valide : tous les champs non passés
    explicitement dans `champs_trouves` sont déclarés non trouvés."""
    non_trouves = [champ for champ in TOUS_LES_CHAMPS if champ not in champs_trouves]
    return ResultatExtractionFdr(**champs_trouves, champs_non_trouves=non_trouves)


class ValeurExtraiteTests(SimpleTestCase):
    def test_valeurs_minimales_valides(self):
        valeur = ChampExtraitTexte(valeur="Jean Dupont", confiance=0.5)
        self.assertEqual(valeur.valeur, "Jean Dupont")
        self.assertIsNone(valeur.page)
        self.assertIsNone(valeur.extrait_source)

    def test_page_et_source_optionnelles_renseignees(self):
        valeur = ChampExtraitTexte(
            valeur="Jean Dupont", confiance=0.92, page=3, extrait_source="Assuré : Jean Dupont"
        )
        self.assertEqual(valeur.page, 3)
        self.assertEqual(valeur.extrait_source, "Assuré : Jean Dupont")

    def test_confiance_hors_bornes_rejetee(self):
        with self.assertRaises(ValidationError):
            ChampExtraitTexte(valeur="x", confiance=1.5)
        with self.assertRaises(ValidationError):
            ChampExtraitTexte(valeur="x", confiance=-0.1)

    def test_page_non_positive_rejetee(self):
        with self.assertRaises(ValidationError):
            ChampExtraitTexte(valeur="x", confiance=0.5, page=0)

    def test_extrait_source_vide_rejete(self):
        with self.assertRaises(ValidationError):
            ChampExtraitTexte(valeur="x", confiance=0.5, extrait_source="")

    def test_valeur_texte_vide_rejetee(self):
        with self.assertRaises(ValidationError):
            ChampExtraitTexte(valeur="", confiance=0.5)
        with self.assertRaises(ValidationError):
            ChampExtraitTexte(valeur="   ", confiance=0.5)

    def test_champ_inconnu_rejete(self):
        with self.assertRaises(ValidationError):
            ChampExtraitTexte(valeur="x", confiance=0.5, score=0.9)

    def test_mode_strict_rejette_coercition_type(self):
        with self.assertRaises(ValidationError):
            ChampExtraitTexte(valeur=123, confiance=0.5)
        with self.assertRaises(ValidationError):
            ChampExtraitDate(valeur="2026-01-01", confiance=0.5)
        with self.assertRaises(ValidationError):
            ChampExtraitMontant(valeur="1000", confiance=0.5)

    def test_date_et_montant_types_reels_acceptes(self):
        champ_date = ChampExtraitDate(valeur=date(2026, 3, 1), confiance=0.7)
        champ_montant = ChampExtraitMontant(valeur=Decimal("15000.50"), confiance=0.7)
        self.assertEqual(champ_date.valeur, date(2026, 3, 1))
        self.assertEqual(champ_montant.valeur, Decimal("15000.50"))

    def test_valeur_manquante_rejetee(self):
        with self.assertRaises(ValidationError):
            ValeurExtraite(confiance=0.5)


class ChampsEnumeresTests(SimpleTestCase):
    def test_type_chantier_valeur_valide(self):
        champ = ChampExtraitTypeChantier(valeur="RENOVATION", confiance=0.6)
        self.assertEqual(champ.valeur, "RENOVATION")

    def test_type_chantier_valeur_invalide_rejetee(self):
        with self.assertRaises(ValidationError):
            ChampExtraitTypeChantier(valeur="AUTRE", confiance=0.6)

    def test_usage_valeur_invalide_rejetee(self):
        with self.assertRaises(ValidationError):
            ChampExtraitUsage(valeur="INDUSTRIE", confiance=0.6)

    def test_usage_valeur_valide(self):
        champ = ChampExtraitUsage(valeur="AUTRE", confiance=0.6)
        self.assertEqual(champ.valeur, "AUTRE")

    def test_intervention_type_valeur_invalide_rejetee(self):
        with self.assertRaises(ValidationError):
            ChampExtraitTypeIntervention(valeur="AUTRE", confiance=0.6)


class ResultatExtractionFdrTests(SimpleTestCase):
    def test_tous_les_champs_non_trouves_est_valide(self):
        resultat = ResultatExtractionFdr(champs_non_trouves=TOUS_LES_CHAMPS)
        self.assertEqual(resultat.champs_non_trouves, TOUS_LES_CHAMPS)
        for champ in TOUS_LES_CHAMPS:
            self.assertIsNone(getattr(resultat, champ))

    def test_champ_renseigne_absent_de_champs_non_trouves(self):
        resultat = _resultat_vide(
            assure_nom=ChampExtraitTexte(valeur="Jean Dupont", confiance=0.9)
        )
        self.assertEqual(resultat.assure_nom.valeur, "Jean Dupont")
        self.assertNotIn("assure_nom", resultat.champs_non_trouves)

    def test_champ_ni_renseigne_ni_liste_est_rejete(self):
        incomplet = [c for c in TOUS_LES_CHAMPS if c != "assure_nom"]
        with self.assertRaises(ValidationError):
            ResultatExtractionFdr(champs_non_trouves=incomplet)

    def test_champ_renseigne_et_liste_comme_non_trouve_est_rejete(self):
        with self.assertRaises(ValidationError):
            ResultatExtractionFdr(
                assure_nom=ChampExtraitTexte(valeur="Jean Dupont", confiance=0.9),
                champs_non_trouves=TOUS_LES_CHAMPS,
            )

    def test_doublon_dans_champs_non_trouves_est_rejete(self):
        with self.assertRaises(ValidationError):
            ResultatExtractionFdr(champs_non_trouves=TOUS_LES_CHAMPS + ["assure_nom"])

    def test_champ_non_trouve_inconnu_est_rejete(self):
        with self.assertRaises(ValidationError):
            ResultatExtractionFdr(
                champs_non_trouves=[c for c in TOUS_LES_CHAMPS if c != "assure_nom"]
                + ["champ_qui_nexiste_pas"]
            )

    def test_champ_supplementaire_hors_contrat_rejete(self):
        with self.assertRaises(ValidationError):
            ResultatExtractionFdr(
                champs_non_trouves=TOUS_LES_CHAMPS,
                modification_structure=True,
            )

    def test_booleens_metier_absents_du_contrat(self):
        # Ces booléens exigent une interprétation, pas une simple lecture : hors contrat.
        self.assertNotIn("modification_structure", ResultatExtractionFdr.model_fields)
        self.assertNotIn("chantier_atypique", ResultatExtractionFdr.model_fields)
        self.assertNotIn("activite_couverte", ResultatExtractionFdr.model_fields)
        self.assertNotIn("travaux_standards", ResultatExtractionFdr.model_fields)
        self.assertNotIn("activite_non_couverte_texte", ResultatExtractionFdr.model_fields)

    def test_resultat_complet_toutes_valeurs_renseignees(self):
        resultat = ResultatExtractionFdr(
            assure_nom=ChampExtraitTexte(valeur="Jean Dupont", confiance=0.9, page=1),
            assure_ville=ChampExtraitTexte(valeur="Lyon", confiance=0.8),
            assure_numero_contrat=ChampExtraitTexte(valeur="1234567890123", confiance=0.7),
            chantier_nom=ChampExtraitTexte(valeur="Résidence les Tilleuls", confiance=0.85),
            chantier_ville=ChampExtraitTexte(valeur="Lyon", confiance=0.85),
            type_chantier=ChampExtraitTypeChantier(valeur="NEUVE", confiance=0.75),
            usage=ChampExtraitUsage(valeur="HABITATION", confiance=0.9),
            date_debut=ChampExtraitDate(valeur=date(2026, 1, 5), confiance=0.6),
            date_fin=ChampExtraitDate(valeur=date(2026, 6, 30), confiance=0.6),
            montant_total=ChampExtraitMontant(valeur=Decimal("500000.00"), confiance=0.65),
            intervention_description=ChampExtraitTexte(valeur="Gros œuvre", confiance=0.7),
            intervention_montant_prestation=ChampExtraitMontant(valeur=Decimal("80000.00"), confiance=0.7),
            intervention_type=ChampExtraitTypeIntervention(valeur="SOUS_TRAITANT", confiance=0.7),
            # usage_autre_texte n'a pas de sens ici : usage vaut HABITATION, pas AUTRE.
            champs_non_trouves=["usage_autre_texte"],
        )
        self.assertEqual(resultat.champs_non_trouves, ["usage_autre_texte"])
        self.assertEqual(resultat.montant_total.valeur, Decimal("500000.00"))

    def test_model_validate_json_avec_montants_numeriques_produit_des_decimal(self):
        # Forme réaliste d'une réponse Mistral une fois le schéma corrigé :
        # les montants sont des nombres JSON, pas des chaînes.
        champs_null = [
            c for c in TOUS_LES_CHAMPS if c not in ("montant_total", "intervention_montant_prestation")
        ]
        brut = json.dumps(
            {champ: None for champ in champs_null}
            | {
                "montant_total": {"valeur": 500000.00, "confiance": 0.7},
                "intervention_montant_prestation": {"valeur": 80000.5, "confiance": 0.6},
                "champs_non_trouves": champs_null,
            }
        )

        resultat = ResultatExtractionFdr.model_validate_json(brut)

        self.assertIsInstance(resultat.montant_total.valeur, Decimal)
        self.assertIsInstance(resultat.intervention_montant_prestation.valeur, Decimal)
        self.assertEqual(resultat.montant_total.valeur, Decimal("500000.00"))
        self.assertEqual(resultat.intervention_montant_prestation.valeur, Decimal("80000.5"))

    def test_model_validate_json_accepte_un_resultat_entierement_absent(self):
        # Forme que produirait un document_annotation Mistral n'ayant rien
        # trouvé : chaque champ explicitement `null`, listé dans
        # champs_non_trouves — jamais une valeur inventée.
        brut = json.dumps({champ: None for champ in TOUS_LES_CHAMPS} | {"champs_non_trouves": TOUS_LES_CHAMPS})
        resultat = ResultatExtractionFdr.model_validate_json(brut)
        self.assertEqual(resultat.champs_non_trouves, TOUS_LES_CHAMPS)
        for champ in TOUS_LES_CHAMPS:
            self.assertIsNone(getattr(resultat, champ))

    def test_serialisation_json_round_trip(self):
        original = _resultat_vide(
            assure_nom=ChampExtraitTexte(valeur="Jean Dupont", confiance=0.9, page=2, extrait_source="Assuré : Jean Dupont"),
            date_debut=ChampExtraitDate(valeur=date(2026, 1, 5), confiance=0.6),
            montant_total=ChampExtraitMontant(valeur=Decimal("500000.00"), confiance=0.65),
        )
        brut = original.model_dump_json()
        recharge = ResultatExtractionFdr.model_validate_json(brut)
        self.assertEqual(recharge, original)
        # Le JSON est bien un objet plat interprétable côté client/tests d'intégration.
        donnees = json.loads(brut)
        self.assertEqual(donnees["assure_nom"]["valeur"], "Jean Dupont")
        self.assertEqual(donnees["assure_nom"]["page"], 2)
        self.assertEqual(donnees["montant_total"]["valeur"], "500000.00")


class MontantJsonSchemaTests(SimpleTestCase):
    """Mistral OCR (document_annotation_format) rejette le schéma par défaut
    de Decimal (`anyOf[number, string au format décimal]`, erreur 3700
    "Invalid structured output syntax") : `montant_total` et
    `intervention_montant_prestation` doivent exposer `{"type": "number"}`."""

    def _schema_valeur(self, champ):
        schema = ResultatExtractionFdr.model_json_schema()
        ref = next(branche["$ref"] for branche in schema["properties"][champ]["anyOf"] if "$ref" in branche)
        nom_def = ref.split("/")[-1]
        return schema["$defs"][nom_def]["properties"]["valeur"]

    def test_montant_total_expose_type_number_simple(self):
        self.assertEqual(self._schema_valeur("montant_total"), {"title": "Valeur", "type": "number"})

    def test_intervention_montant_prestation_expose_type_number_simple(self):
        self.assertEqual(
            self._schema_valeur("intervention_montant_prestation"), {"title": "Valeur", "type": "number"}
        )

    def test_montants_nont_plus_anyof_number_string(self):
        for champ in ("montant_total", "intervention_montant_prestation"):
            with self.subTest(champ=champ):
                schema_valeur = self._schema_valeur(champ)
                self.assertNotIn("anyOf", schema_valeur)
                self.assertNotIn("pattern", schema_valeur)
