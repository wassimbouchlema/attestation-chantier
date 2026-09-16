import { useEffect } from "react";

/**
 * Le titre de l'onglet restait identique sur tous les écrans (aucune gestion
 * applicative). react-router ne gère pas <title> lui-même ; pas de dépendance
 * dédiée pour un besoin aussi simple, un petit hook suffit.
 */
export const useDocumentTitle = (titre: string) => {
  useEffect(() => {
    document.title = `${titre} — Attestation de chantier`;
  }, [titre]);
};
