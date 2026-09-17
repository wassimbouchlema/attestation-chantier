"""Évaluation automatique fictive du risque d'un FDR.

Scoring **fictif, déterministe et démonstratif** — aucun modèle actuariel réel,
aucune probabilité de sinistre. Sert uniquement à illustrer le fonctionnement
attendu par le sujet du test technique.

Indépendant de `rules.py` par choix assumé : `calculer_pieces_requises` (obligation
documentaire) et `calculer_evaluation_risque` (scoring fictif) sont deux règles
métier distinctes qui partagent aujourd'hui les mêmes déclencheurs, mais ne
doivent pas être couplées techniquement — un futur changement de l'une ne doit
jamais modifier implicitement l'autre. La petite répétition des six conditions
est donc volontaire.

Fonction pure : aucune requête DB, aucun effet de bord, ne lit que les attributs
de l'instance `FormulaireRisque` passée en argument (jamais `PieceJustificative`,
`pieces_manquantes` ni `dossier_complet`, qui sont un signal indépendant).
"""

from decimal import Decimal

from .models import FormulaireRisque, TypeChantier, Usage

POINTS_STRUCTURE = 20
POINTS_USAGE = 10
POINTS_COMPLEXITE = 25
POINTS_MONTANT = 20
POINTS_ACTIVITE = 15
POINTS_TRAVAUX = 10

SEUIL_MONTANT_TOTAL = Decimal("10000000")

NIVEAU_FAIBLE = "faible"
NIVEAU_MODERE = "modere"
NIVEAU_ELEVE = "eleve"

SEUIL_RISQUE_MODERE = 25
SEUIL_RISQUE_ELEVE = 50

SYNTHESES_PAR_NIVEAU = {
    NIVEAU_FAIBLE: (
        "Aucun facteur de risque significatif n'a été identifié par l'évaluation "
        "automatique indicative."
    ),
    NIVEAU_MODERE: (
        "Plusieurs facteurs de vigilance ont été identifiés par l'évaluation "
        "automatique indicative."
    ),
    NIVEAU_ELEVE: (
        "Plusieurs facteurs de risque significatifs nécessitent une attention "
        "particulière selon l'évaluation automatique indicative."
    ),
}


def determiner_niveau_risque(score: int) -> str:
    if score >= SEUIL_RISQUE_ELEVE:
        return NIVEAU_ELEVE
    if score >= SEUIL_RISQUE_MODERE:
        return NIVEAU_MODERE
    return NIVEAU_FAIBLE


def calculer_evaluation_risque(fdr: FormulaireRisque) -> dict:
    score = 0

    if fdr.type_chantier == TypeChantier.RENOVATION and fdr.modification_structure is True:
        score += POINTS_STRUCTURE

    if fdr.usage == Usage.AUTRE:
        score += POINTS_USAGE

    if fdr.chantier_atypique is True:
        score += POINTS_COMPLEXITE

    if fdr.montant_total is not None and fdr.montant_total > SEUIL_MONTANT_TOTAL:
        score += POINTS_MONTANT

    if fdr.activite_couverte is False:
        score += POINTS_ACTIVITE

    if fdr.travaux_standards is False:
        score += POINTS_TRAVAUX

    niveau = determiner_niveau_risque(score)

    return {
        "score": score,
        "niveau": niveau,
        "synthese": SYNTHESES_PAR_NIVEAU[niveau],
    }
