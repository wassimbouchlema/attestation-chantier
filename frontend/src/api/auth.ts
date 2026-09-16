const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

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

/** Identifiants/session invalides (401) — la session doit être considérée comme terminée. */
export class ErreurAuthentification extends Error {}

/**
 * Échec réseau, erreur serveur (5xx) ou réponse inexploitable — l'état de la
 * session est indéterminé, elle ne doit pas être invalidée sur cette seule base.
 */
export class ErreurReseauOuServeur extends Error {}

const estAnnulee = (erreur: unknown): boolean => erreur instanceof Error && erreur.name === "AbortError";

const appeler = async (input: string, init: RequestInit, messageErreurReseau: string): Promise<Response> => {
  try {
    return await fetch(input, init);
  } catch (erreur) {
    if (estAnnulee(erreur)) {
      throw erreur;
    }
    throw new ErreurReseauOuServeur(messageErreurReseau);
  }
};

const lireJson = async <T>(response: Response, messageErreurParsing: string): Promise<T> => {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ErreurReseauOuServeur(messageErreurParsing);
  }
};

export const login = async (username: string, password: string, signal?: AbortSignal): Promise<TokenPair> => {
  const messageGenerique = "Une erreur est survenue. Veuillez réessayer.";
  const response = await appeler(
    `${API_BASE_URL}/auth/login/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal,
    },
    messageGenerique,
  );
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
  const response = await appeler(
    `${API_BASE_URL}/auth/me/`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal },
    messageIndisponible,
  );
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
  const response = await appeler(
    `${API_BASE_URL}/auth/refresh/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: refreshToken }),
      signal,
    },
    messageIndisponible,
  );
  if (response.status === 401) {
    throw new ErreurAuthentification("Session expirée.");
  }
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  const data = await lireJson<{ access: string }>(response, messageIndisponible);
  return data.access;
};
