// Le repli localhost est réservé au dev : un build de production sans VITE_API_BASE_URL doit échouer visiblement.
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:8000/api" : "");

if (!API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL n’est pas défini pour ce build.");
}

/** Identifiants/session invalides (401) — la session doit être considérée comme terminée. */
export class ErreurAuthentification extends Error {}

/**
 * Échec réseau, erreur serveur ou réponse inexploitable — l'état n'est pas
 * déterminé, pas de conclusion définitive à en tirer.
 */
export class ErreurReseauOuServeur extends Error {}

export const estAnnulee = (erreur: unknown): boolean => erreur instanceof Error && erreur.name === "AbortError";

const MESSAGE_ERREUR_RESEAU = "Une erreur est survenue. Veuillez réessayer.";

const appeler = async (input: string, init: RequestInit): Promise<Response> => {
  try {
    return await fetch(input, init);
  } catch (erreur) {
    if (estAnnulee(erreur)) {
      throw erreur;
    }
    throw new ErreurReseauOuServeur(MESSAGE_ERREUR_RESEAU);
  }
};

export const lireJson = async <T>(response: Response, messageErreurParsing: string): Promise<T> => {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ErreurReseauOuServeur(messageErreurParsing);
  }
};

/** Requête sans authentification (ex. login) : pas de token, pas de retry sur 401. */
export const requetePublique = (path: string, init: RequestInit = {}): Promise<Response> => {
  return appeler(`${API_BASE_URL}${path}`, init);
};
