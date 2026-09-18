import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  creerProjetAttestation,
  recupererProjetAttestation,
  recupererProjetAttestationPdf,
  sauvegarderProjetAttestation,
  type ProjetAttestationApi,
} from "../../api/projetAttestation";

export const projetAttestationKeys = {
  all: ["projet-attestation"] as const,
  deDemande: (demandeId: string) => [...projetAttestationKeys.all, demandeId] as const,
};

export const useProjetAttestation = (demandeId: string) => {
  return useQuery({
    queryKey: projetAttestationKeys.deDemande(demandeId),
    queryFn: ({ signal }) => recupererProjetAttestation(demandeId, signal),
  });
};

export const useCreerProjetAttestation = (demandeId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => creerProjetAttestation(demandeId),
    onSuccess: (projet) => {
      queryClient.setQueryData<ProjetAttestationApi | null>(projetAttestationKeys.deDemande(demandeId), projet);
    },
  });
};

/**
 * Mutation (pas une query), comme pour le PDF du FDR : le PDF n'est généré
 * qu'au clic explicite (Prévisualiser/Télécharger) et jamais mis en cache —
 * le `Blob` est éphémère, consommé immédiatement par l'appelant.
 */
export const useTelechargerProjetAttestationPdf = (demandeId: string) => {
  return useMutation({
    mutationFn: () => recupererProjetAttestationPdf(demandeId),
  });
};

export const useSauvegarderProjetAttestation = (demandeId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contenuHtml: string) => sauvegarderProjetAttestation(demandeId, contenuHtml),
    onSuccess: (projet) => {
      queryClient.setQueryData<ProjetAttestationApi | null>(projetAttestationKeys.deDemande(demandeId), projet);
    },
  });
};
