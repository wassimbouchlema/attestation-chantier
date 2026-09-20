import type { ReactNode } from "react";

import "./AccueilAvecSynthese.css";

/**
 * Contenu principal + synthèse secondaire. La synthèse est placée en premier dans le DOM
 * (affichée avant la liste sur petit écran) puis repoussée en colonne latérale sur grand écran.
 */
export const AccueilAvecSynthese = ({ synthese, children }: { synthese: ReactNode; children: ReactNode }) => {
  return (
    <div className="accueil-synthese">
      <aside className="accueil-synthese__synthese">{synthese}</aside>
      <div className="accueil-synthese__principal">{children}</div>
    </div>
  );
};
