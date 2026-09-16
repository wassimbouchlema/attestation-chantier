import { createContext } from "react";

import type { Utilisateur } from "../../api/auth";

export interface AuthContextValue {
  utilisateur: Utilisateur | null;
  isLoading: boolean;
  /**
   * Non null quand la vérification de session a échoué pour une raison
   * indéterminée (réseau/serveur) plutôt qu'une session réellement invalide
   * — l'utilisateur n'est pas pour autant déconnecté de force.
   */
  erreurSession: string | null;
  /** Retente la vérification de session (après une erreurSession). */
  reessayerSession: () => void;
  login: (username: string, password: string) => Promise<Utilisateur>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const ACCESS_TOKEN_KEY = "access_token";
export const REFRESH_TOKEN_KEY = "refresh_token";
