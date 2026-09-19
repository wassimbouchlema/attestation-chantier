import { useMutation, useQuery } from "@tanstack/react-query";

import { listerDemandesSiege, recupererDemande, recupererFdrPdf } from "../../api/demandes";
import { recupererFichierPieceSiege } from "../../api/pieces";

export const BASE_PATH_SIEGE = "/siege/demandes";

export const siegeDemandesKeys = {
  all: ["siege-demandes"] as const,
  listes: () => [...siegeDemandesKeys.all, "liste"] as const,
  liste: (page: number) => [...siegeDemandesKeys.listes(), page] as const,
  details: () => [...siegeDemandesKeys.all, "detail"] as const,
  detail: (id: string) => [...siegeDemandesKeys.details(), id] as const,
};

export const useDemandesSiege = (page: number) => {
  return useQuery({
    queryKey: siegeDemandesKeys.liste(page),
    queryFn: ({ signal }) => listerDemandesSiege(page, signal),
  });
};

export const useDemandeSiege = (id: string | undefined) => {
  return useQuery({
    queryKey: siegeDemandesKeys.detail(id ?? ""),
    queryFn: ({ signal }) => recupererDemande(id as string, signal, BASE_PATH_SIEGE),
    enabled: Boolean(id),
  });
};

/**
 * Mutation (pas une query), comme côté DISTRIBUTEUR : le PDF n'est récupéré
 * qu'au clic explicite (Prévisualiser/Télécharger), jamais mis en cache.
 */
export const useTelechargerFdrPdfSiege = (demandeId: string) => {
  return useMutation({
    mutationFn: () => recupererFdrPdf(demandeId, BASE_PATH_SIEGE),
  });
};

/** Idem, par pièce : `pieceId` est passé à `mutate()` (pas figé à la création du hook), une instance suffit par ligne. */
export const useTelechargerFichierPieceSiege = (demandeId: string) => {
  return useMutation({
    mutationFn: (pieceId: string) => recupererFichierPieceSiege(demandeId, pieceId),
  });
};
