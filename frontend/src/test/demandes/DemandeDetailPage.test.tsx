import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import type { Demande } from "../../api/demandes";
import { AuthProvider } from "../../features/auth/AuthProvider";
import { createQueryClient } from "../../queryClient";
import { DemandeDetailPage } from "../../pages/DemandeDetail/DemandeDetailPage";
import { server } from "../server";
import { seedSession } from "../utils";

const ID_DEMANDE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const renderPage = (chemin = `/distributeur/demandes/${ID_DEMANDE}`) =>
  render(
    <AuthProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[chemin]}>
          <Routes>
            <Route path="/distributeur" element={<p>Mes demandes (liste)</p>} />
            <Route path="/distributeur/demandes/:id" element={<DemandeDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthProvider>,
  );

const demandeApi: Demande = {
  id: ID_DEMANDE,
  distributeur: 1,
  statut: "EN_COURS",
  created_at: "2026-09-10T08:00:00Z",
  updated_at: "2026-09-12T10:30:00Z",
};

beforeEach(() => {
  seedSession("DISTRIBUTEUR");
});

describe("DemandeDetailPage — données réelles uniquement", () => {
  it("affiche le statut et les dates réellement renvoyés par l'API, sans FDR simulé", async () => {
    server.use(http.get("*/demandes/:id/", () => HttpResponse.json(demandeApi)));
    renderPage();

    expect(await screen.findByText("En cours")).toBeInTheDocument();
    expect(screen.getByText(/Créée le 10\/09\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Dernière modification le 12\/09\/2026/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(ID_DEMANDE))).toBeInTheDocument();
  });

  it("propose un retour vers la liste qui fonctionne", async () => {
    const user = userEvent.setup();
    server.use(http.get("*/demandes/:id/", () => HttpResponse.json(demandeApi)));
    renderPage();
    await screen.findByText("En cours");

    await user.click(screen.getByRole("link", { name: "Retour à mes demandes" }));

    expect(await screen.findByText("Mes demandes (liste)")).toBeInTheDocument();
  });

  it("ne présente aucune violation d'accessibilité détectable (axe)", async () => {
    server.use(http.get("*/demandes/:id/", () => HttpResponse.json(demandeApi)));
    const { container } = renderPage();
    await screen.findByText("En cours");

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("DemandeDetailPage — cas d'erreur", () => {
  it("affiche un message explicite quand la demande est introuvable (404)", async () => {
    server.use(http.get("*/demandes/:id/", () => new HttpResponse(null, { status: 404 })));
    renderPage();

    const message = await screen.findByText("Cette demande est introuvable.");
    expect(message.closest('[role="alert"]')).not.toBeNull();
    expect(screen.getByRole("link", { name: "Retour à mes demandes" })).toBeInTheDocument();
  });

  it("affiche une erreur réseau/serveur générique en cas d'échec 500", async () => {
    server.use(http.get("*/demandes/:id/", () => new HttpResponse(null, { status: 500 })));
    renderPage();

    const message = await screen.findByText("Impossible de récupérer cette demande.");
    expect(message.closest('[role="alert"]')).not.toBeNull();
  });
});
