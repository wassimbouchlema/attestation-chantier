import { messageErreurAffichable } from "../../../demandes/helpers/messageErreur";
import { usePieces, useSupprimerPiece } from "../../queries";

/**
 * Orchestration (queries/mutation TanStack Query bas niveau + dérivés
 * d'affichage) pour PiecesJustificativesSection. `pieces_requises`/
 * `pieces_manquantes`/`dossier_complet` restent tels que renvoyés par
 * `GET /pieces/` — source de vérité unique côté backend, aucun recalcul ici.
 */
export const usePiecesJustificativesSection = (demandeId: string) => {
  const piecesQuery = usePieces(demandeId);
  const supprimerPieceMutation = useSupprimerPiece(demandeId);

  return {
    isLoading: piecesQuery.isLoading,
    erreurChargement: piecesQuery.isError ? messageErreurAffichable(piecesQuery.error) : null,
    reessayerChargement: () => piecesQuery.refetch(),
    dossierCharge: piecesQuery.isSuccess,
    dossierComplet: piecesQuery.data?.dossier_complet ?? false,
    piecesRequises: piecesQuery.data?.pieces_requises ?? [],
    piecesManquantes: piecesQuery.data?.pieces_manquantes ?? [],
    pieces: piecesQuery.data?.pieces ?? [],
    supprimerPiece: (pieceId: string) => supprimerPieceMutation.mutate(pieceId),
    pieceEnSuppression: supprimerPieceMutation.isPending ? (supprimerPieceMutation.variables ?? null) : null,
    erreurSuppression: supprimerPieceMutation.isError ? messageErreurAffichable(supprimerPieceMutation.error) : null,
    fermerErreurSuppression: () => supprimerPieceMutation.reset(),
  };
};
