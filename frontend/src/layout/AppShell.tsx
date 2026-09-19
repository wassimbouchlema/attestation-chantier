import { Button, Footer, Header, Name, User } from "@axa-fr/canopee-react/distributeur";
import logoAxa from "@axa-fr/canopee-css/logo-axa.svg";
import type { ReactNode } from "react";

import type { Role } from "../api/auth";
import { ClocheNotifications } from "../features/notifications/components/ClocheNotifications/ClocheNotifications";
import "./AppShell.css";
import { useAppShell } from "./useAppShell";

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
  const { contenuRef, utilisateur, nomComplet, deconnecter, allerAAccueil } = useAppShell();

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
            allerAAccueil();
          }}
        />
        {utilisateur && (
          <div className="app-shell__zone-utilisateur">
            <ClocheNotifications role={utilisateur.role} />
            <User name={nomComplet} profile={LIBELLE_ROLE[utilisateur.role]}>
              <Button variant="ghost" className="user-logout-action" onClick={deconnecter}>
                Déconnexion
              </Button>
            </User>
          </div>
        )}
      </Header>
      <div id={ID_CONTENU_PRINCIPAL} ref={contenuRef} tabIndex={-1} className="app-shell__body">
        {children}
      </div>
      <Footer title="AXA France" />
    </div>
  );
};
