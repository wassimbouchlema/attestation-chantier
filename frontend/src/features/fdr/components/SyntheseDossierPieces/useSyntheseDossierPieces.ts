import { messageErreurAffichable } from "../../../demandes/helpers/messageErreur";
import { usePieces } from "../../queries";

export const useSyntheseDossierPieces = (demandeId: string, basePath?: string) => {
  const piecesQuery = usePieces(demandeId, basePath);

  return {
    isLoading: piecesQuery.isLoading,
    erreurChargement: piecesQuery.isError ? messageErreurAffichable(piecesQuery.error) : null,
    reessayerChargement: () => piecesQuery.refetch(),
    dossierCharge: piecesQuery.isSuccess,
    dossierComplet: piecesQuery.data?.dossier_complet ?? false,
    piecesRequises: piecesQuery.data?.pieces_requises ?? [],
    piecesManquantes: piecesQuery.data?.pieces_manquantes ?? [],
    pieces: piecesQuery.data?.pieces ?? [],
  };
};
