import { screen } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

import type { Role } from "../api/auth";
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "../features/auth/authContext";

/**
 * Pré-remplit le localStorage avec des tokens reconnus par les handlers MSW
 * (voir test/handlers.ts), pour simuler une session déjà active au montage
 * de AuthProvider sans repasser par le formulaire de login dans chaque test.
 */
export const seedSession = (role: Role) => {
  const suffixe = role === "SIEGE" ? "siege" : "distributeur";
  localStorage.setItem(ACCESS_TOKEN_KEY, `access-token-${suffixe}`);
  localStorage.setItem(REFRESH_TOKEN_KEY, `refresh-token-${suffixe}`);
};

/** Saisit une ville puis choisit la suggestion correspondante (geo.api.gouv.fr mocké, voir handlers.ts). */
export const choisirVille = async (user: ReturnType<typeof userEvent.setup>, nom: string) => {
  await user.type(screen.getByLabelText("Ville"), nom);
  await user.click(await screen.findByRole("option", { name: new RegExp(`^${nom}`) }));
};
