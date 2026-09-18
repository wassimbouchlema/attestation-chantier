import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  creerDemandeAvecFdr,
  listerDemandes,
  recupererDemande,
  recupererFdrPdf,
  supprimerDemande,
  type FormulaireRisqueApi,
  type StatutDemande,
} from "../../api/demandes";

export const demandesKeys = {
  all: ["demandes"] as const,
  listes: () => [...demandesKeys.all, "liste"] as const,
  liste: (filtres: { statut: StatutDemande | ""; page: number }) => [...demandesKeys.listes(), filtres] as const,
  details: () => [...demandesKeys.all, "detail"] as const,
  detail: (id: string) => [...demandesKeys.details(), id] as const,
};

export const useDemandes = (filtres: { statut: StatutDemande | ""; page: number }) => {
  return useQuery({
    queryKey: demandesKeys.liste(filtres),
    queryFn: ({ signal }) => listerDemandes(filtres, signal),
  });
};

export const useDemande = (id: string | undefined) => {
  return useQuery({
    queryKey: demandesKeys.detail(id ?? ""),
    queryFn: ({ signal }) => recupererDemande(id as string, signal),
    enabled: Boolean(id),
  });
};

export const useCreerDemandeAvecFdr = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fdr: FormulaireRisqueApi) => creerDemandeAvecFdr(fdr),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: demandesKeys.listes() });
    },
  });
};

export const useSupprimerDemande = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => supprimerDemande(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: demandesKeys.listes() });
    },
  });
};

/**
 * Mutation (pas une query) : le PDF n'est récupéré qu'à la demande explicite
 * de l'utilisateur (clic Prévisualiser/Télécharger), jamais mis en cache — le
 * `Blob` résultant est éphémère, consommé immédiatement par l'appelant
 * (window.open ou déclenchement de téléchargement).
 */
export const useTelechargerFdrPdf = (demandeId: string) => {
  return useMutation({
    mutationFn: () => recupererFdrPdf(demandeId),
  });
};
