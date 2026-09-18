import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  envoyerDemande,
  mettreAJourFdr,
  sauvegarderCommentaire,
  type DemandeDetail,
  type FormulaireRisqueApi,
} from "../../api/demandes";
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

/** Met à jour directement le cache (pas juste une invalidation) : évite un aller-retour réseau pour un seul champ déjà connu. */
export const useSauvegarderCommentaire = (demandeId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentaireDistributeur: string) => sauvegarderCommentaire(demandeId, commentaireDistributeur),
    onSuccess: (reponse) => {
      queryClient.setQueryData(demandesKeys.detail(demandeId), (precedente: DemandeDetail | undefined) =>
        precedente ? { ...precedente, commentaire_distributeur: reponse.commentaire_distributeur } : precedente,
      );
    },
  });
};

/**
 * `setQueryData` (pas seulement `invalidateQueries`) avec la réponse déjà
 * complète du backend : le cache doit refléter EN_COURS de façon synchrone,
 * avant même la navigation qui suit — `FdrIndexRedirect` (AppRouter) décide
 * "informations" vs "consultation" en lisant ce même cache immédiatement.
 */
export const useEnvoyerDemande = (demandeId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentaireDistributeur: string) => envoyerDemande(demandeId, commentaireDistributeur),
    onSuccess: (demandeMiseAJour) => {
      queryClient.setQueryData(demandesKeys.detail(demandeId), demandeMiseAJour);
      queryClient.invalidateQueries({ queryKey: demandesKeys.listes() });
    },
  });
};
