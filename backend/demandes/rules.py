"""Moteur métier unique de calcul des pièces justificatives requises pour un FDR.

Source de vérité backend : `calculer_pieces_requises` centralise les six règles de
`docs/regles-metier.md` §2. Ni les serializers ni les vues ne doivent réimplémenter
ces conditions. Fonction pure (aucune requête DB, aucun effet de bord) : elle ne lit
que les attributs de l'instance `FormulaireRisque` passée en argument, ce qui la
rend utilisable sur un brouillon partiel (valeurs `None`/`""`) comme sur une
instance non sauvegardée en test.
"""

from decimal import Decimal

from .models import FormulaireRisque, TypeChantier, Usage

PIECE_STRUCTURE = "structure"
PIECE_USAGE = "usage"
PIECE_COMPLEXITE = "complexite"
PIECE_MONTANT = "montant"
PIECE_ACTIVITE = "activite"
PIECE_TRAVAUX = "travaux"

SEUIL_MONTANT_TOTAL = Decimal("10000000")


def calculer_pieces_requises(fdr: FormulaireRisque) -> list[str]:
    pieces: list[str] = []

    if fdr.type_chantier == TypeChantier.RENOVATION and fdr.modification_structure is True:
        pieces.append(PIECE_STRUCTURE)

    if fdr.usage == Usage.AUTRE:
        pieces.append(PIECE_USAGE)

    if fdr.chantier_atypique is True:
        pieces.append(PIECE_COMPLEXITE)

    if fdr.montant_total is not None and fdr.montant_total > SEUIL_MONTANT_TOTAL:
        pieces.append(PIECE_MONTANT)

    if fdr.activite_couverte is False:
        pieces.append(PIECE_ACTIVITE)

    if fdr.travaux_standards is False:
        pieces.append(PIECE_TRAVAUX)

    return pieces
