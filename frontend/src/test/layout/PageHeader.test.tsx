import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { Role } from "../../api/auth";
import { AuthProvider } from "../../features/auth/AuthProvider";
import { PageHeader } from "../../layout/PageHeader";
import { createQueryClient } from "../../queryClient";
import { seedSession } from "../utils";

const renderHeader = (role: Role, sansAccueil = false) => {
  seedSession(role);
  return render(
    <AuthProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/detail"]}>
          <Routes>
            <Route path="/detail" element={<PageHeader title="Demande d'attestation" sansAccueil={sansAccueil} />} />
            <Route path="/distributeur" element={<p>Accueil distributeur (page)</p>} />
            <Route path="/siege" element={<p>Accueil siège (page)</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthProvider>,
  );
};

describe("PageHeader — retour à l'accueil", () => {
  it("DISTRIBUTEUR : le bouton Home ramène à /distributeur", async () => {
    const user = userEvent.setup();
    renderHeader("DISTRIBUTEUR");

    await user.click(await screen.findByRole("link", { name: "Retour à l'accueil" }));

    expect(await screen.findByText("Accueil distributeur (page)")).toBeInTheDocument();
  });

  it("SIEGE : le bouton Home ramène à /siege, au clavier", async () => {
    const user = userEvent.setup();
    renderHeader("SIEGE");

    const lien = await screen.findByRole("link", { name: "Retour à l'accueil" });
    await user.tab();
    while (document.activeElement !== lien && document.activeElement !== document.body) await user.tab();
    expect(lien).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(await screen.findByText("Accueil siège (page)")).toBeInTheDocument();
  });

  it("précède le titre et peut être masqué sur les pages d'accueil", async () => {
    const { unmount } = renderHeader("SIEGE");
    const lien = await screen.findByRole("link", { name: "Retour à l'accueil" });
    const titre = screen.getByRole("heading", { name: "Demande d'attestation" });
    expect(lien.compareDocumentPosition(titre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();

    renderHeader("SIEGE", true);
    await screen.findByRole("heading", { name: "Demande d'attestation" });
    expect(screen.queryByRole("link", { name: "Retour à l'accueil" })).not.toBeInTheDocument();
  });
});
