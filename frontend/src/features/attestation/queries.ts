import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { preparerAttestation, recupererAttestation, recupererAttestationPdf, sauvegarderAttestation } from "../../api/attestation";
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
