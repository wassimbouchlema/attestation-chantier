import type { ReactNode } from "react";

import "./Surface.css";

/**
 * Surface passive (fond blanc, ombre, coins arrondis) reprenant les tokens
 * du composant Card de Canopée. Card lui-même est un <button> (cliquable),
 * inadapté à un contenu passif (état vide, carte de login, futures sections
 * du FDR) — aucun équivalent passif n'existe dans l'univers distributeur.
 */
export const Surface = ({ children, className }: { children: ReactNode; className?: string }) => {
  return <div className={["surface", className].filter(Boolean).join(" ")}>{children}</div>;
};
