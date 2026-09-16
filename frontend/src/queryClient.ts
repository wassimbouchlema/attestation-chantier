import { QueryClient } from "@tanstack/react-query";

/**
 * Pas de retry automatique par défaut : http.ts gère déjà, en interne, la
 * seule tentative de récupération pertinente (401 -> refresh -> retry une
 * fois). Un retry TanStack par-dessus ajouterait des tentatives sur des
 * erreurs qui ne se résoudront pas d'elles-mêmes (validation, 404, etc.) et
 * ralentirait les tests d'erreur.
 */
export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
