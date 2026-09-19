import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import type { DemandeDetail, DemandesPagineesDetail, FormulaireRisqueApi } from "../../api/demandes";
import { AuthProvider } from "../../features/auth/AuthProvider";
import { SiegeHome } from "../../pages/SiegeHome/SiegeHome";
import { createQueryClient } from "../../queryClient";
import { server } from "../server";
import { seedSession } from "../utils";

const DetailStub = () => {
  const { id } = useParams<{ id: string }>();
  return <p>Détail SIÈGE de la demande {id}</p>;
};

const renderPage = () =>
  render(
    <AuthProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/siege"]}>
          <Routes>
            <Route path="/siege" element={<SiegeHome />} />
            <Route path="/siege/demandes/:id" element={<DetailStub />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthProvider>,
  );

const FDR_MINIMAL: FormulaireRisqueApi = {
  assure_nom: "AXA Construction",
  assure_ville: "Paris",
  assure_numero_contrat: "1234567890123",
  chantier_nom: "Tour Horizon",
  chantier_ville: "Lyon",
  type_chantier: "NEUVE",
  modification_structure: null,
  chantier_atypique: false,
  usage: "BUREAU",
  usage_autre_texte: "",
  date_debut: null,
  date_fin: null,
  montant_total: null,
  intervention_description: "",
  intervention_montant_prestation: null,
  intervention_type: "",
  activite_couverte: null,
  activite_non_couverte_texte: "",
  travaux_standards: null,
};

const creerDemande = (overrides: Partial<DemandeDetail> = {}): DemandeDetail => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  distributeur: 1,
  distributeur_nom: "Jean Dupont",
  statut: "EN_COURS",
  created_at: "2026-09-10T08:00:00Z",
  updated_at: "2026-09-12T10:30:00Z",
  envoye_at: "2026-09-12T09:00:00Z",
  last_relance_at: null,
  commentaire_distributeur: "",
  fdr: FDR_MINIMAL,
  ...overrides,
});

const paginer = (results: DemandeDetail[]): DemandesPagineesDetail => ({
  count: results.length,
  next: null,
  previous: null,
  results,
});

beforeEach(() => {
  seedSession("SIEGE");
});

describe("SiegeHome — liste EN_COURS", () => {
  it("affiche l'état vide quand aucune demande n'est en cours", async () => {
    server.use(http.get("*/siege/demandes/", () => HttpResponse.json(paginer([]))));
    renderPage();

    expect(await screen.findByText("Aucune demande pour le moment.")).toBeInTheDocument();
  });

  it("affiche les demandes renvoyées par l'API SIÈGE (assuré, chantier, statut)", async () => {
    server.use(http.get("*/siege/demandes/", () => HttpResponse.json(paginer([creerDemande()]))));
    renderPage();

    expect(await screen.findByRole("cell", { name: "AXA Construction" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Tour Horizon" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "En cours" })).toBeInTheDocument();
  });

  it("le lien Traiter ouvre le détail de la demande", async () => {
    const user = userEvent.setup();
    server.use(http.get("*/siege/demandes/", () => HttpResponse.json(paginer([creerDemande()]))));
    renderPage();
    await screen.findByRole("link", { name: /Traiter/ });

    await user.click(screen.getByRole("link", { name: /Traiter/ }));

    expect(
      await screen.findByText("Détail SIÈGE de la demande aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    ).toBeInTheDocument();
  });

  it("affiche une erreur explicite avec un bouton Réessayer en cas d'échec API", async () => {
    server.use(http.get("*/siege/demandes/", () => new HttpResponse(null, { status: 500 })));
    renderPage();

    const message = await screen.findByText("Impossible de récupérer les demandes à traiter.");
    expect(message.closest('[role="alert"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });
});
