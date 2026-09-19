import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { recupererAttestationFinalePdf } from "../../api/attestation";
import {
  creerDemandeAvecFdr,
  listerDemandes,
  recupererDemande,
  recupererFdrPdf,
  relancerDemande,
  supprimerDemande,
  type DemandeDetail,
  type FormulaireRisqueApi,
} from "../../api/demandes";
import type { FiltresListe } from "./helpers/parseFiltresListe";

export const demandesKeys = {
  all: ["demandes"] as const,
  listes: () => [...demandesKeys.all, "liste"] as const,
  liste: (filtres: FiltresListe) => [...demandesKeys.listes(), filtres] as const,
  details: () => [...demandesKeys.all, "detail"] as const,
  detail: (id: string) => [...demandesKeys.details(), id] as const,
};

export const useDemandes = (filtres: FiltresListe) => {
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
 * `setQueryData` (pas seulement `invalidateQueries`) : le nouveau
 * `last_relance_at` doit être reflété de façon synchrone dans le cache, sans
 * attendre un aller-retour réseau — la liste est aussi invalidée car
 * `updated_at` change côté backend.
 */
export const useRelancerDemande = (demandeId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => relancerDemande(demandeId),
    onSuccess: (reponse) => {
      queryClient.setQueryData(demandesKeys.detail(demandeId), (precedente: DemandeDetail | undefined) =>
        precedente ? { ...precedente, last_relance_at: reponse.last_relance_at, updated_at: reponse.updated_at } : precedente,
      );
      queryClient.invalidateQueries({ queryKey: demandesKeys.listes() });
    },
    onError: () => {
      // Le backend reste l'unique source de vérité (cooldown, statut) : un
      // refus (ex. DELAI_RELANCE_NON_ECOULE) peut signifier que le cache local
      // est périmé — le détail est rechargé pour refléter l'état réel.
      queryClient.invalidateQueries({ queryKey: demandesKeys.detail(demandeId) });
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

export const useTelechargerAttestationFinale = () => {
  return useMutation({
    mutationFn: (demandeId: string) => recupererAttestationFinalePdf(demandeId),
  });
};
