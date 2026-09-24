from ..models import FormulaireRisque
from ..rules import calculer_pieces_manquantes, calculer_pieces_requises


def etat_dossier_pieces(fdr: FormulaireRisque, pieces, pieces_donnees: list) -> dict:
    pieces_requises = calculer_pieces_requises(fdr)
    pieces_presentes = {piece.type_piece for piece in pieces}
    pieces_manquantes = calculer_pieces_manquantes(pieces_requises, pieces_presentes)

    return {
        "pieces": pieces_donnees,
        "pieces_requises": pieces_requises,
        "pieces_manquantes": pieces_manquantes,
        "dossier_complet": not pieces_manquantes,
    }
