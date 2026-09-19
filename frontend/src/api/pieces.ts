import { ErreurReseauOuServeur, lireJson } from "./http";
import { requeteAuthentifiee } from "./httpAuthentifie";

/** Identifiants techniques des 6 catégories de pièces, source de vérité : `demandes/rules.py` (backend). */
export type CategoriePiece = "structure" | "usage" | "complexite" | "montant" | "activite" | "travaux";

export interface PieceJustificativeApi {
  id: string;
  type_piece: CategoriePiece;
  nom_fichier_original: string;
  uploaded_at: string;
}

/**
 * Reflète exactement la réponse de `GET /demandes/{id}/pieces/` : le backend
 * reste l'unique source de vérité pour `pieces_requises`/`pieces_manquantes`/
 * `dossier_complet` — jamais recalculés côté frontend (les 6 règles ne sont
 * pas dupliquées ici).
 */
export interface PiecesResponseApi {
  pieces: PieceJustificativeApi[];
  pieces_requises: CategoriePiece[];
  pieces_manquantes: CategoriePiece[];
  dossier_complet: boolean;
}

/** `basePath` : `/demandes` (DISTRIBUTEUR, défaut) ou `/siege/demandes` (SIÈGE, lecture seule). */
export const recupererPieces = async (
  demandeId: string,
  signal?: AbortSignal,
  basePath: string = "/demandes",
): Promise<PiecesResponseApi> => {
  const messageIndisponible = "Impossible de récupérer les pièces justificatives.";
  const response = await requeteAuthentifiee(`${basePath}/${demandeId}/pieces/`, { signal });
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<PiecesResponseApi>(response, messageIndisponible);
};

export const uploaderPiece = async (
  demandeId: string,
  typePiece: CategoriePiece,
  fichier: File,
): Promise<PieceJustificativeApi> => {
  const messageIndisponible = "Impossible d'envoyer ce fichier.";
  const formData = new FormData();
  formData.append("type_piece", typePiece);
  formData.append("fichier", fichier);

  // Pas de header Content-Type manuel : le navigateur pose lui-même le
  // boundary multipart correct à partir du FormData.
  const response = await requeteAuthentifiee(`/demandes/${demandeId}/pieces/`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<PieceJustificativeApi>(response, messageIndisponible);
};

/**
 * `GET /siege/demandes/{demandeId}/pieces/{pieceId}/fichier/` — pas d'équivalent
 * DISTRIBUTEUR (il a déposé le fichier lui-même), pas de MEDIA_URL public.
 */
export const recupererFichierPieceSiege = async (demandeId: string, pieceId: string): Promise<Blob> => {
  const messageIndisponible = "Impossible de récupérer ce fichier.";
  const response = await requeteAuthentifiee(`/siege/demandes/${demandeId}/pieces/${pieceId}/fichier/`);
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return response.blob();
};

export const supprimerPiece = async (demandeId: string, pieceId: string): Promise<void> => {
  const messageIndisponible = "Impossible de supprimer ce fichier.";
  const response = await requeteAuthentifiee(`/demandes/${demandeId}/pieces/${pieceId}/`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
};
