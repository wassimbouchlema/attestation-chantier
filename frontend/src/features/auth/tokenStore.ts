import { refreshAccessToken } from "../../api/auth";
import { ErreurAuthentification } from "../../api/http";
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "./authContext";

/**
 * Source unique de lecture/écriture des tokens (localStorage) et de
 * coordination du refresh. Module JS pur : aucune dépendance React, aucune
 * logique UI. N'appelle jamais directement setUtilisateur/navigate — se
 * limite à notifier un handler de déconnexion enregistré depuis l'extérieur
 * (AuthProvider), qui reste seul responsable de l'état applicatif.
 */

export const getAccessToken = (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY);
export const getRefreshToken = (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY);

export const setAccessToken = (token: string): void => {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
};

export const clearTokens = (): void => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

let logoutHandler: (() => void) | null = null;

/**
 * Enregistre le handler appelé quand un refresh échoue définitivement.
 * Un seul handler actif à la fois — un nouvel enregistrement remplace le
 * précédent, jamais d'accumulation. Retourne une fonction de nettoyage :
 * l'appelant (AuthProvider) doit la rappeler à son démontage pour ne pas
 * laisser un handler obsolète enregistré.
 */
export const registerLogoutHandler = (handler: () => void): (() => void) => {
  logoutHandler = handler;
  return () => {
    if (logoutHandler === handler) {
      logoutHandler = null;
    }
  };
};

let refreshEnCours: Promise<string> | null = null;

/**
 * Rafraîchit l'access token à partir du refresh token stocké. Dédupliqué :
 * un refresh déjà en vol est renvoyé tel quel à tout appelant concurrent
 * plutôt que d'en déclencher un second. Sur échec définitif (refresh token
 * absent ou rejeté par le serveur), efface les tokens et notifie le handler
 * de déconnexion enregistré avant de relancer l'erreur. Une erreur réseau
 * pendant le refresh ne déclenche pas de déconnexion (incertitude, pas un
 * refus confirmé) — même philosophie que AuthProvider.restaurerSession.
 */
export const rafraichirAccessToken = (): Promise<string> => {
  if (refreshEnCours) {
    return refreshEnCours;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearTokens();
    logoutHandler?.();
    return Promise.reject(new ErreurAuthentification("Session expirée."));
  }

  refreshEnCours = refreshAccessToken(refreshToken)
    .then((nouveauToken) => {
      setAccessToken(nouveauToken);
      return nouveauToken;
    })
    .catch((erreur: unknown) => {
      if (erreur instanceof ErreurAuthentification) {
        clearTokens();
        logoutHandler?.();
      }
      throw erreur;
    })
    .finally(() => {
      refreshEnCours = null;
    });

  return refreshEnCours;
};
