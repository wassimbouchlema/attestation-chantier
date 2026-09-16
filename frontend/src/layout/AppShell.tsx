import { Button, Footer, Header, Name, User } from "@axa-fr/canopee-react/distributeur";
import logoAxa from "@axa-fr/canopee-css/logo-axa.svg";
import { useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import type { Role } from "../api/auth";
import { useAuth } from "../features/auth/useAuth";
import { resolveHomePath } from "../features/auth/roleHome";

const LIBELLE_ROLE: Record<Role, string> = {
  DISTRIBUTEUR: "Distributeur",
  SIEGE: "Siège",
};

const ID_CONTENU_PRINCIPAL = "contenu-principal";

/**
 * Shell commun : Header (full width) + Footer, avec la zone entre les deux
 * laissée libre. Chaque page compose elle-même ce qu'elle met dans cette
 * zone (HeaderTitle full width, puis MainContainer contraint) — AppShell
 * n'impose aucun wrapper entre Header et le contenu.
 */
export const AppShell = ({ children }: { children: ReactNode }) => {
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

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const nomComplet = utilisateur
    ? `${utilisateur.first_name} ${utilisateur.last_name}`.trim() || utilisateur.username
    : "";

  return (
    <div className="app-shell">
      <a href={`#${ID_CONTENU_PRINCIPAL}`} className="skip-link">
        Aller au contenu
      </a>
      <Header>
        <Name
          title="Attestation de chantier"
          img={logoAxa}
          alt="AXA"
          onClick={({ event }) => {
            event.preventDefault();
            navigate(resolveHomePath(utilisateur));
          }}
        />
        {utilisateur && (
          <User name={nomComplet} profile={LIBELLE_ROLE[utilisateur.role]}>
            <Button variant="ghost" className="user-logout-action" onClick={handleLogout}>
              Déconnexion
            </Button>
          </User>
        )}
      </Header>
      <div id={ID_CONTENU_PRINCIPAL} ref={contenuRef} tabIndex={-1} className="app-shell__body">
        {children}
      </div>
      <Footer title="AXA France" />
    </div>
  );
};
