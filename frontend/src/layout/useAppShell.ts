import { useEffect, useRef } from "react";

import { useNavigate } from "react-router-dom";

import { resolveHomePath } from "../features/auth/roleHome";
import { useAuth } from "../features/auth/useAuth";

/** Orchestration du shell applicatif : session, focus sur le contenu au changement de page, déconnexion. */
export const useAppShell = () => {
  const { utilisateur, logout } = useAuth();
  const navigate = useNavigate();
  const contenuRef = useRef<HTMLDivElement>(null);

  /**
   * Chaque route rend un AppShell distinct (routes non imbriquées dans
   * AppRouter) : un effet au montage suffit à envoyer le focus sur le
   * contenu à chaque changement de page, sans dépendre de useLocation.
   */
  useEffect(() => {
    contenuRef.current?.focus();
  }, []);

  const deconnecter = () => {
    logout();
    navigate("/login");
  };

  const allerAAccueil = () => {
    navigate(resolveHomePath(utilisateur));
  };

  const nomComplet = utilisateur
    ? `${utilisateur.first_name} ${utilisateur.last_name}`.trim() || utilisateur.username
    : "";

  return { contenuRef, utilisateur, nomComplet, deconnecter, allerAAccueil };
};
