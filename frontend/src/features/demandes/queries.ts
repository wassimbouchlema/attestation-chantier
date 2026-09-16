import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { creerDemande, listerDemandes, recupererDemande, type StatutDemande } from "../../api/demandes";

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

export const useCreerDemande = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => creerDemande(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: demandesKeys.listes() });
    },
  });
};
