import { ErreurAuthentification, ErreurReseauOuServeur, lireJson } from "./http";
import { requeteAuthentifiee } from "./httpAuthentifie";

// Réexportées : les sites d'import existants (hooks, composants, tests)
// continuent de les importer depuis api/demandes.ts sans changement.
export { ErreurAuthentification, ErreurReseauOuServeur };

/**
 * Doit correspondre à `DemandePagination.page_size` (backend/demandes/views.py).
 * DRF ne renvoie pas la taille de page dans la réponse paginée (count/next/
 * previous/results) : c'est la seule façon pour le front de calculer un
 * nombre total de pages. Dépendance explicite et minimale, pas dupliquée
 * ailleurs.
 */
export const TAILLE_PAGE = 10;

export type StatutDemande = "BROUILLON" | "EN_COURS" | "TRAITE";

export interface Demande {
  id: string;
  distributeur: number;
  statut: StatutDemande;
  created_at: string;
  updated_at: string;
}

export interface DemandesPaginees {
  count: number;
  next: string | null;
  previous: string | null;
  results: Demande[];
}

/** La demande ciblée n'existe pas ou n'appartient pas à l'utilisateur connecté (404). */
export class ErreurDemandeIntrouvable extends Error {}

export const listerDemandes = async (
  filtres: { statut?: StatutDemande | ""; page?: number },
  signal?: AbortSignal,
): Promise<DemandesPaginees> => {
  const messageIndisponible = "Impossible de récupérer vos demandes.";
  const params = new URLSearchParams();
  if (filtres.statut) {
    params.set("statut", filtres.statut);
  }
  if (filtres.page && filtres.page > 1) {
    params.set("page", String(filtres.page));
  }
  const queryString = params.toString();

  const response = await requeteAuthentifiee(`/demandes/${queryString ? `?${queryString}` : ""}`, { signal });
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<DemandesPaginees>(response, messageIndisponible);
};

export const recupererDemande = async (id: string, signal?: AbortSignal): Promise<Demande> => {
  const messageIndisponible = "Impossible de récupérer cette demande.";
  const response = await requeteAuthentifiee(`/demandes/${id}/`, { signal });
  if (response.status === 404) {
    throw new ErreurDemandeIntrouvable("Cette demande est introuvable.");
  }
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<Demande>(response, messageIndisponible);
};

export const creerDemande = async (signal?: AbortSignal): Promise<Demande> => {
  const messageIndisponible = "Impossible de créer la demande.";
  const response = await requeteAuthentifiee("/demandes/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    signal,
  });
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<Demande>(response, messageIndisponible);
};
