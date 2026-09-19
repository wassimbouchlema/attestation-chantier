import type { PieceJustificativeApi } from "../../../../api/pieces";
import { previsualiserFichier, telechargerFichier } from "../../../demandes/helpers/fichierActions";
import { useTelechargerFichierPieceSiege } from "../../queries";

/** Une instance de mutation par ligne : `isPending` reste isolé par pièce, sans état "pièce en cours" au niveau du tableau. */
export const usePieceActions = (demandeId: string, piece: PieceJustificativeApi) => {
  const telechargerFichierMutation = useTelechargerFichierPieceSiege(demandeId);

  const previsualiser = () => {
    telechargerFichierMutation.mutate(piece.id, { onSuccess: previsualiserFichier });
  };

  const telecharger = () => {
    telechargerFichierMutation.mutate(piece.id, {
      onSuccess: (blob) => telechargerFichier(blob, piece.nom_fichier_original),
    });
  };

  return {
    previsualiser,
    telecharger,
    enCours: telechargerFichierMutation.isPending,
  };
};
