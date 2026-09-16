import { ErreurAuthentification, ErreurReseauOuServeur, lireJson, requetePublique } from "./http";

// Réexportées pour ne pas casser les imports existants (AuthProvider,
// LoginPage) : la définition unique vit désormais dans http.ts.
export { ErreurAuthentification, ErreurReseauOuServeur };

export type Role = "DISTRIBUTEUR" | "SIEGE";

export interface Utilisateur {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  role: Role;
}

interface TokenPair {
  access: string;
  refresh: string;
}

export const login = async (username: string, password: string, signal?: AbortSignal): Promise<TokenPair> => {
  const messageGenerique = "Une erreur est survenue. Veuillez réessayer.";
  const response = await requetePublique("/auth/login/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    signal,
  });
  if (response.status === 401) {
    throw new ErreurAuthentification("Identifiant ou mot de passe incorrect.");
  }
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageGenerique);
  }
  return lireJson<TokenPair>(response, messageGenerique);
};

export const fetchMe = async (accessToken: string, signal?: AbortSignal): Promise<Utilisateur> => {
  const messageIndisponible = "Impossible de récupérer le profil utilisateur.";
  const response = await requetePublique("/auth/me/", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (response.status === 401) {
    throw new ErreurAuthentification("Session invalide.");
  }
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<Utilisateur>(response, messageIndisponible);
};

export const refreshAccessToken = async (refreshToken: string, signal?: AbortSignal): Promise<string> => {
  const messageIndisponible = "Impossible de renouveler la session.";
  const response = await requetePublique("/auth/refresh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: refreshToken }),
    signal,
  });
  if (response.status === 401) {
    throw new ErreurAuthentification("Session expirée.");
  }
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  const data = await lireJson<{ access: string }>(response, messageIndisponible);
  return data.access;
};
