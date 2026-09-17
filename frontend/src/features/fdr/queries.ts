import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { mettreAJourFdr, type FormulaireRisqueApi } from "../../api/demandes";
import { recupererEvaluationRisque } from "../../api/evaluationRisque";
import { recupererPieces, supprimerPiece, uploaderPiece, type CategoriePiece } from "../../api/pieces";
import { demandesKeys } from "../demandes/queries";

export const piecesKeys = {
  all: ["pieces"] as const,
  deDemande: (demandeId: string) => [...piecesKeys.all, demandeId] as const,
};

export const evaluationRisqueKeys = {
  all: ["evaluation-risque"] as const,
  deDemande: (demandeId: string) => [...evaluationRisqueKeys.all, demandeId] as const,
};

/**
 * Au succès, invalide aussi pieces/evaluation-risque : les deux dépendent du
 * FDR (pieces_requises, score) et doivent redevenir à jour si l'utilisateur
 * revient sur Informations, corrige puis reconfirme.
 */
export const useMettreAJourFdr = (demandeId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FormulaireRisqueApi) => mettreAJourFdr(demandeId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: demandesKeys.detail(demandeId) });
      queryClient.invalidateQueries({ queryKey: piecesKeys.deDemande(demandeId) });
      queryClient.invalidateQueries({ queryKey: evaluationRisqueKeys.deDemande(demandeId) });
    },
  });
};

export const usePieces = (demandeId: string) => {
  return useQuery({
    queryKey: piecesKeys.deDemande(demandeId),
    queryFn: ({ signal }) => recupererPieces(demandeId, signal),
  });
};

export const useUploaderPiece = (demandeId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ typePiece, fichier }: { typePiece: CategoriePiece; fichier: File }) =>
      uploaderPiece(demandeId, typePiece, fichier),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: piecesKeys.deDemande(demandeId) });
    },
  });
};

export const useSupprimerPiece = (demandeId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pieceId: string) => supprimerPiece(demandeId, pieceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: piecesKeys.deDemande(demandeId) });
    },
  });
};

export const useEvaluationRisque = (demandeId: string) => {
  return useQuery({
    queryKey: evaluationRisqueKeys.deDemande(demandeId),
    queryFn: ({ signal }) => recupererEvaluationRisque(demandeId, signal),
  });
};
