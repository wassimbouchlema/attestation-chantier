import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DemandeDetail, FormulaireRisqueApi } from "../../api/demandes";
import type { EvaluationRisqueApi } from "../../api/evaluationRisque";
import type { PiecesResponseApi } from "../../api/pieces";
import { AuthProvider } from "../../features/auth/AuthProvider";
import { SiegeDemandeConsultationPage } from "../../pages/SiegeDemandeConsultationPage/SiegeDemandeConsultationPage";
import { createQueryClient } from "../../queryClient";
import { server } from "../server";
import { seedSession } from "../utils";

const ID_DEMANDE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const FDR_COMPLET: FormulaireRisqueApi = {
  assure_nom: "AXA Construction",
  assure_ville: "Paris",
  assure_numero_contrat: "123456789",
  chantier_nom: "Tour Horizon",
  chantier_ville: "Lyon",
  type_chantier: "NEUVE",
  modification_structure: null,
  chantier_atypique: false,
  usage: "BUREAU",
  usage_autre_texte: "",
  date_debut: "2026-01-10",
  date_fin: "2026-06-30",
  montant_total: "100000.00",
  intervention_description: "Rénovation complète",
  intervention_montant_prestation: "50000.00",
  intervention_type: "PRINCIPALE",
  activite_couverte: true,
  activite_non_couverte_texte: "",
  travaux_standards: true,
};

const demandeApi = (overrides: Partial<DemandeDetail> = {}): DemandeDetail => ({
  id: ID_DEMANDE,
  distributeur: 1,
  distributeur_nom: "Jean Dupont",
  statut: "EN_COURS",
  created_at: "2026-09-10T08:00:00Z",
  updated_at: "2026-09-12T10:30:00Z",
  envoye_at: "2026-09-17T12:15:00Z",
  last_relance_at: null,
  commentaire_distributeur: "",
  fdr: FDR_COMPLET,
  ...overrides,
});

const renderPage = () =>
  render(
    <AuthProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[`/siege/demandes/${ID_DEMANDE}`]}>
          <Routes>
            <Route path="/siege" element={<p>Demandes à traiter (page)</p>} />
            <Route path="/siege/demandes/:id" element={<SiegeDemandeConsultationPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthProvider>,
  );

const mockDemande = (demande: DemandeDetail) => {
  server.use(http.get("*/siege/demandes/:id/", () => HttpResponse.json(demande)));
};

const mockPieces = (reponse: PiecesResponseApi) => {
  server.use(http.get("*/siege/demandes/:id/pieces/", () => HttpResponse.json(reponse)));
};

const mockEvaluationRisque = (reponse: EvaluationRisqueApi) => {
  server.use(http.get("*/siege/demandes/:id/evaluation-risque/", () => HttpResponse.json(reponse)));
};

const PIECES_COMPLETES: PiecesResponseApi = {
  pieces: [{ id: "piece-1", type_piece: "complexite", nom_fichier_original: "note.pdf", uploaded_at: "2026-09-17T10:00:00Z" }],
  pieces_requises: ["complexite"],
  pieces_manquantes: [],
  dossier_complet: true,
};

const EVALUATION: EvaluationRisqueApi = { score: 10, niveau: "faible", synthese: "Aucun facteur." };

let clicDeTelechargement: { download: string; href: string } | null;

beforeEach(() => {
  seedSession("SIEGE");
  clicDeTelechargement = null;
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicDeTelechargement = { download: this.download, href: this.href };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SiegeDemandeConsultationPage — affichage lecture seule", () => {
  it("affiche le statut, l'envoi, le distributeur, le récapitulatif, les pièces, le risque et le commentaire", async () => {
    mockDemande(demandeApi({ commentaire_distributeur: "Dossier urgent, merci." }));
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();

    expect(await screen.findByText("En cours")).toBeInTheDocument();
    expect(screen.getByText(/17\/09\/2026/)).toBeInTheDocument();
    expect(screen.getByText("Jean Dupont")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Récapitulatif des informations" })).toBeInTheDocument();
    expect(screen.getByText("AXA Construction")).toBeInTheDocument();
    expect(await screen.findByText("Complet")).toBeInTheDocument();
    expect(screen.getByText("note.pdf")).toBeInTheDocument();
    expect(await screen.findByText("Faible")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Commentaire distributeur" })).toBeInTheDocument();
    expect(screen.getByText("Dossier urgent, merci.")).toBeInTheDocument();
  });

  it("aucune action de mutation (pas de bouton Créer/Modifier le projet, pas de Relancer)", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();
    await screen.findByRole("heading", { name: "Récapitulatif des informations" });

    expect(screen.queryByRole("button", { name: /Relancer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Créer le projet/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Modifier le projet/ })).not.toBeInTheDocument();
  });

  it("ne consulte ni n'affiche le projet du distributeur", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    const requeteProjet = vi.fn(() =>
      HttpResponse.json({
        contenu_html: "<p>Projet distributeur</p>",
        created_at: "2026-09-18T09:00:00Z",
        updated_at: "2026-09-18T10:30:00Z",
      }),
    );
    server.use(http.get("*/siege/demandes/:id/projet-attestation/", requeteProjet));
    renderPage();

    await screen.findByText("note.pdf");
    await screen.findByText("Faible");
    expect(screen.queryByRole("heading", { name: /Projet d'attestation/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Consulter le projet" })).not.toBeInTheDocument();
    expect(requeteProjet).not.toHaveBeenCalled();
  });

  it("demande introuvable (404) affiche un message dédié", async () => {
    server.use(http.get("*/siege/demandes/:id/", () => new HttpResponse(null, { status: 404 })));
    renderPage();

    expect(await screen.findByText("Cette demande est introuvable.")).toBeInTheDocument();
  });
});

describe("SiegeDemandeConsultationPage — PDF FDR", () => {
  it("Prévisualiser récupère le PDF via l'endpoint SIÈGE et l'ouvre dans un nouvel onglet", async () => {
    const user = userEvent.setup();
    const ouvertureOnglet = vi.spyOn(window, "open").mockReturnValue(null);
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    let urlAppelee = "";
    server.use(
      http.get("*/siege/demandes/:id/fdr-pdf/", ({ request }) => {
        urlAppelee = request.url;
        return new HttpResponse("%PDF-1.4 contenu", { headers: { "Content-Type": "application/pdf" } });
      }),
    );
    renderPage();
    await screen.findByRole("button", { name: "Prévisualiser" });

    await user.click(screen.getByRole("button", { name: "Prévisualiser" }));

    await vi.waitFor(() => expect(ouvertureOnglet).toHaveBeenCalledWith("blob:mock-url", "_blank"));
    expect(urlAppelee).toContain(`/siege/demandes/${ID_DEMANDE}/fdr-pdf/`);
  });
});

describe("SiegeDemandeConsultationPage — actions sur une pièce", () => {
  it("le tableau des pièces affiche une colonne Actions avec Prévisualiser et Télécharger", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();

    expect(await screen.findByRole("columnheader", { name: "Actions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prévisualiser note.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Télécharger note.pdf" })).toBeInTheDocument();
  });

  it("aucun bouton Supprimer ou d'upload dans le tableau des pièces", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();
    await screen.findByText("note.pdf");

    expect(screen.queryByRole("button", { name: /Supprimer/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Justificatif/)).not.toBeInTheDocument();
  });

  it("Prévisualiser une pièce récupère son contenu et l'ouvre dans un nouvel onglet", async () => {
    const user = userEvent.setup();
    const ouvertureOnglet = vi.spyOn(window, "open").mockReturnValue(null);
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    let urlAppelee = "";
    server.use(
      http.get("*/siege/demandes/:id/pieces/:pieceId/fichier/", ({ request }) => {
        urlAppelee = request.url;
        return new HttpResponse("%PDF-1.4 contenu de la pièce", { headers: { "Content-Type": "application/pdf" } });
      }),
    );
    renderPage();
    await screen.findByRole("button", { name: "Prévisualiser note.pdf" });

    await user.click(screen.getByRole("button", { name: "Prévisualiser note.pdf" }));

    await vi.waitFor(() => expect(ouvertureOnglet).toHaveBeenCalledWith("blob:mock-url", "_blank"));
    expect(urlAppelee).toContain(`/siege/demandes/${ID_DEMANDE}/pieces/piece-1/fichier/`);
  });

  it("Télécharger une pièce déclenche un téléchargement nommé d'après nom_fichier_original", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    server.use(
      http.get(
        "*/siege/demandes/:id/pieces/:pieceId/fichier/",
        () => new HttpResponse("%PDF-1.4 contenu de la pièce", { headers: { "Content-Type": "application/pdf" } }),
      ),
    );
    renderPage();
    await screen.findByRole("button", { name: "Télécharger note.pdf" });

    await user.click(screen.getByRole("button", { name: "Télécharger note.pdf" }));

    await vi.waitFor(() => expect(clicDeTelechargement).not.toBeNull());
    expect(clicDeTelechargement?.download).toBe("note.pdf");
  });
});

describe("SiegeDemandeConsultationPage — retour", () => {
  it("Retour aux demandes navigue vers /siege", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();
    await screen.findByRole("button", { name: "Retour aux demandes" });

    await user.click(screen.getByRole("button", { name: "Retour aux demandes" }));

    expect(await screen.findByText("Demandes à traiter (page)")).toBeInTheDocument();
  });
});
