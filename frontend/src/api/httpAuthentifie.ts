import { getAccessToken, rafraichirAccessToken } from "../features/auth/tokenStore";
import { ErreurAuthentification, requetePublique } from "./http";

const avecToken = (init: RequestInit, token: string): RequestInit => ({
  ...init,
  headers: { ...init.headers, Authorization: `Bearer ${token}` },
});

/**
 * Requête authentifiée : attache le token courant (tokenStore), et sur un
 * premier 401 tente UN refresh (dédupliqué par tokenStore) puis rejoue la
 * requête UNE seule fois avec le nouveau token. Si ce retry retourne encore
 * 401, aucune nouvelle tentative n'est faite — l'échec est signalé comme
 * ErreurAuthentification, de façon uniforme quel que soit l'essai qui a
 * échoué : l'appelant (api/demandes.ts) n'a jamais besoin d'inspecter
 * lui-même un statut 401. Pour toute autre réponse (200, 400, 404, 500...),
 * la Response brute est retournée telle quelle — aucune connaissance de
 * Demande/FDR ici, c'est à l'appelant de l'interpréter.
 */
export const requeteAuthentifiee = async (
  path: string,
  init: RequestInit = {},
  dejaTente = false,
): Promise<Response> => {
  const token = getAccessToken();
  const response = await requetePublique(path, token ? avecToken(init, token) : init);

  if (response.status !== 401) {
    return response;
  }
  if (dejaTente) {
    throw new ErreurAuthentification("Session invalide.");
  }

  const nouveauToken = await rafraichirAccessToken();
  return requeteAuthentifiee(path, avecToken(init, nouveauToken), true);
};
