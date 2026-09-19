import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  analyserCoherenceAttestation,
  preparerAttestation,
  recupererAttestation,
  recupererAttestationFinalePdf,
  recupererAttestationPdf,
  sauvegarderAttestation,
  validerAttestation,
} from "../../api/attestation";
import { siegeDemandesKeys } from "../siege/queries";

const attestationKey = (id: string) => ["attestation-siege", id] as const;

export const useAttestation = (id: string) => useQuery({
  queryKey: attestationKey(id),
  queryFn: ({ signal }) => recupererAttestation(id, signal),
});

export const usePreparerAttestation = (id: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => preparerAttestation(id),
    onSuccess: (attestation) => {
      client.setQueryData(attestationKey(id), attestation);
      void client.invalidateQueries({ queryKey: siegeDemandesKeys.detail(id) });
    },
  });
};

export const useSauvegarderAttestation = (id: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (html: string) => sauvegarderAttestation(id, html),
    onSuccess: (attestation) => client.setQueryData(attestationKey(id), attestation),
  });
};

export const useAttestationPdf = (id: string) => useMutation({
  mutationFn: () => recupererAttestationPdf(id),
});

export const useAnalyserCoherence = (id: string) => useMutation({
  mutationFn: () => analyserCoherenceAttestation(id),
  retry: false,
});

export const useValiderAttestation = (id: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => validerAttestation(id),
    retry: false,
    onSuccess: (demande) => {
      client.setQueryData(siegeDemandesKeys.detail(id), demande);
      void client.invalidateQueries({ queryKey: siegeDemandesKeys.listes() });
    },
  });
};

export const useAttestationFinalePdf = (id: string) => useMutation({
  mutationFn: () => recupererAttestationFinalePdf(id),
});
