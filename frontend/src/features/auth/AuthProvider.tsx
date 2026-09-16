import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import {
  ErreurAuthentification,
  fetchMe,
  login as loginRequest,
  refreshAccessToken,
  type Utilisateur,
} from "../../api/auth";
import { ACCESS_TOKEN_KEY, AuthContext, REFRESH_TOKEN_KEY } from "./authContext";
import { registerLogoutHandler } from "./tokenStore";

const MESSAGE_SESSION_INDISPONIBLE = "Impossible de vérifier votre session. Vérifiez votre connexion puis réessayez.";

const estAnnulee = (erreur: unknown): boolean => erreur instanceof Error && erreur.name === "AbortError";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [erreurSession, setErreurSession] = useState<string | null>(null);

  /**
   * Toute opération qui affecte la session (restauration, login, logout) passe
   * par ce contrôleur : en démarrer une nouvelle annule automatiquement la
   * précédente si elle est encore en vol. Ça évite qu'une restauration lente
   * (ou le double-effet de StrictMode en dev) n'écrase, en résolvant en
   * retard, le profil d'une connexion/déconnexion plus récente.
   */
  const operationRef = useRef<AbortController | null>(null);

  const demarrerOperation = useCallback((): AbortController => {
    operationRef.current?.abort();
    const controller = new AbortController();
    operationRef.current = controller;
    return controller;
  }, []);

  const restaurerSession = useCallback(async () => {
    const controller = demarrerOperation();
    setIsLoading(true);
    setErreurSession(null);

    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

    if (!accessToken || !refreshToken) {
      setIsLoading(false);
      return;
    }

    try {
      const profil = await fetchMe(accessToken, controller.signal);
      setUtilisateur(profil);
      setIsLoading(false);
      return;
    } catch (erreur) {
      if (estAnnulee(erreur)) {
        return;
      }
      if (!(erreur instanceof ErreurAuthentification)) {
        setErreurSession(MESSAGE_SESSION_INDISPONIBLE);
        setIsLoading(false);
        return;
      }
    }

    try {
      const nouvelAccessToken = await refreshAccessToken(refreshToken, controller.signal);
      const profil = await fetchMe(nouvelAccessToken, controller.signal);
      localStorage.setItem(ACCESS_TOKEN_KEY, nouvelAccessToken);
      setUtilisateur(profil);
    } catch (erreur) {
      if (estAnnulee(erreur)) {
        return;
      }
      if (erreur instanceof ErreurAuthentification) {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        setUtilisateur(null);
      } else {
        setErreurSession(MESSAGE_SESSION_INDISPONIBLE);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [demarrerOperation]);

  useEffect(() => {
    restaurerSession();
    return () => {
      operationRef.current?.abort();
    };
  }, [restaurerSession]);

  const login = useCallback(
    async (username: string, password: string) => {
      const controller = demarrerOperation();
      const { access, refresh } = await loginRequest(username, password, controller.signal);
      const profil = await fetchMe(access, controller.signal);
      if (controller.signal.aborted) {
        throw new Error("Connexion annulée.");
      }
      localStorage.setItem(ACCESS_TOKEN_KEY, access);
      localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
      setUtilisateur(profil);
      setErreurSession(null);
      setIsLoading(false);
      return profil;
    },
    [demarrerOperation],
  );

  const logout = useCallback(() => {
    operationRef.current?.abort();
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setUtilisateur(null);
    setErreurSession(null);
    setIsLoading(false);
  }, []);

  /**
   * Permet à tokenStore (hors React, utilisé par le transport HTTP des
   * queries/mutations) de déclencher une vraie déconnexion applicative quand
   * un refresh échoue définitivement en cours de session. registerLogoutHandler
   * remplace le handler précédent (jamais d'accumulation) et retourne le
   * nettoyage à appeler au démontage pour ne pas laisser un handler obsolète.
   */
  useEffect(() => {
    return registerLogoutHandler(logout);
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{ utilisateur, isLoading, erreurSession, reessayerSession: restaurerSession, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};
