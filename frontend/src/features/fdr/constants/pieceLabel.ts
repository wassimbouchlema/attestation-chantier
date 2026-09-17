import type { CategoriePiece } from "../../../api/pieces";

/**
 * `structure`/`usage`/`complexite`/`montant`/`activite`/`travaux` sont des
 * identifiants techniques renvoyés par le backend (voir `demandes/rules.py`
 * côté backend) — ce mapping est la seule traduction en libellés lisibles,
 * sans prétendre reproduire des noms officiels de documents.
 */
export const LIBELLE_CATEGORIE_PIECE: Record<CategoriePiece, string> = {
  structure: "Justificatif lié à la modification de structure",
  usage: "Justificatif lié à l'usage du chantier",
  complexite: "Justificatif lié au caractère atypique du chantier",
  montant: "Justificatif lié au montant du chantier",
  activite: "Justificatif lié à l'activité hors contrat",
  travaux: "Justificatif lié aux travaux non standards",
};
