import type { Utilisateur } from "../../api/auth";

/**
 * Seule source de vérité pour "où doit atterrir cet utilisateur" — utilisée
 * par la route "/", le clic sur le logo (AppShell), la redirection après
 * login (LoginPage) et la garde de route par rôle (ProtectedRoute), pour
 * éviter de dupliquer `role === "SIEGE" ? ... : ...` à quatre endroits.
 */
export const resolveHomePath = (utilisateur: Utilisateur | null): string => {
  if (!utilisateur) {
    return "/login";
  }
  return utilisateur.role === "SIEGE" ? "/siege" : "/distributeur";
};
