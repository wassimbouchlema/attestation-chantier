import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import type { DemandeDetail, FormulaireRisqueApi } from "../../api/demandes";
import type { EvaluationRisqueApi } from "../../api/evaluationRisque";
import type { PieceJustificativeApi, PiecesResponseApi } from "../../api/pieces";
import { AuthProvider } from "../../features/auth/AuthProvider";
import { FdrWizardLayout } from "../../features/fdr/components/FdrWizardLayout/FdrWizardLayout";
import { FdrPiecesPage } from "../../pages/FdrPieces/FdrPiecesPage";
import { createQueryClient } from "../../queryClient";
import { server } from "../server";
import { seedSession } from "../utils";

const ID_DEMANDE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const FDR_VIDE: FormulaireRisqueApi = {
  assure_nom: "",
  assure_ville: "",
  assure_numero_contrat: "",
  chantier_nom: "",
  chantier_ville: "",
  type_chantier: "",
  modification_structure: null,
  chantier_atypique: null,
  usage: "",
  usage_autre_texte: "",
  date_debut: "",
  date_fin: "",
  montant_total: "",
  intervention_description: "",
  intervention_montant_prestation: "",
  intervention_type: "",
  activite_couverte: null,
  activite_non_couverte_texte: "",
  travaux_standards: null,
};

const demandeApi = (overrides: Partial<DemandeDetail> = {}): DemandeDetail => ({
  id: ID_DEMANDE,
  distributeur: 1,
  statut: "BROUILLON",
  created_at: "2026-09-10T08:00:00Z",
  updated_at: "2026-09-12T10:30:00Z",
  fdr: FDR_VIDE,
  ...overrides,
});

const renderWizard = (chemin = `/distributeur/demandes/${ID_DEMANDE}/pieces`) =>
  render(
    <AuthProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[chemin]}>
          <Routes>
            <Route path="/distributeur/demandes/:id" element={<FdrWizardLayout />}>
              <Route index element={<Navigate to="informations" replace />} />
              <Route path="informations" element={<p>Informations (page)</p>} />
              <Route path="pieces" element={<FdrPiecesPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthProvider>,
  );

const mockDemande = (demande: DemandeDetail) => {
  server.use(http.get("*/demandes/:id/", () => HttpResponse.json(demande)));
};

const mockPieces = (reponse: PiecesResponseApi) => {
  server.use(http.get("*/demandes/:id/pieces/", () => HttpResponse.json(reponse)));
};

const mockEvaluationRisque = (reponse: EvaluationRisqueApi) => {
  server.use(http.get("*/demandes/:id/evaluation-risque/", () => HttpResponse.json(reponse)));
};

beforeEach(() => {
  seedSession("DISTRIBUTEUR");
});

describe("FdrPiecesPage — stepper", () => {
  it("Informations est un lien 'complété' ramenant vers l'étape Informations, Pièces & risque est active", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    mockPieces({ pieces: [], pieces_requises: [], pieces_manquantes: [], dossier_complet: true });
    mockEvaluationRisque({ score: 0, niveau: "faible", synthese: "Aucun facteur." });
    renderWizard();
    await screen.findByRole("heading", { name: "Pièces justificatives" });

    const lienInformations = screen.getByRole("link", { name: /Informations/ });
    expect(lienInformations).toBeInTheDocument();

    await user.click(lienInformations);
    expect(await screen.findByText("Informations (page)")).toBeInTheDocument();
  });
});

describe("FdrPiecesPage — dossier complet / incomplet", () => {
  it("aucune pièce requise : affiche le message dédié et dossier complet", async () => {
    mockDemande(demandeApi());
    mockPieces({ pieces: [], pieces_requises: [], pieces_manquantes: [], dossier_complet: true });
    mockEvaluationRisque({ score: 0, niveau: "faible", synthese: "Aucun facteur." });
    renderWizard();

    expect(await screen.findByText("Dossier complet")).toBeInTheDocument();
    expect(
      screen.getByText("Aucune pièce justificative requise pour les informations renseignées."),
    ).toBeInTheDocument();
  });

  it("catégories manquantes : affiche dossier incomplet et la liste des catégories manquantes", async () => {
    mockDemande(demandeApi());
    mockPieces({
      pieces: [],
      pieces_requises: ["complexite", "activite"],
      pieces_manquantes: ["complexite", "activite"],
      dossier_complet: false,
    });
    mockEvaluationRisque({ score: 40, niveau: "modere", synthese: "Plusieurs facteurs de vigilance." });
    renderWizard();

    // Pas de rôle "listitem" ici : le <ul> perd sa sémantique de liste dans
    // l'arbre d'accessibilité (comportement navigateur/jsdom standard dès
    // qu'un <ul> n'a pas de `list-style`, réel ici dans .af-alert__content) —
    // scoper la recherche de texte au message suffit à lever l'ambiguïté
    // avec les labels FileInput qui reprennent les mêmes libellés.
    const messageIncomplet = (await screen.findByText("Dossier incomplet")).closest('[role="alert"]') as HTMLElement;
    expect(within(messageIncomplet).getByText("Justificatif lié au caractère atypique du chantier")).toBeInTheDocument();
    expect(within(messageIncomplet).getByText("Justificatif lié à l'activité hors contrat")).toBeInTheDocument();
  });
});

describe("FdrPiecesPage — évaluation du risque", () => {
  it("affiche le score, le niveau et la synthèse renvoyés par le backend", async () => {
    mockDemande(demandeApi());
    mockPieces({ pieces: [], pieces_requises: [], pieces_manquantes: [], dossier_complet: true });
    mockEvaluationRisque({
      score: 45,
      niveau: "modere",
      synthese: "Plusieurs facteurs de vigilance ont été identifiés par l'évaluation automatique indicative.",
    });
    renderWizard();

    expect(await screen.findByText("Score : 45 / 100")).toBeInTheDocument();
    expect(screen.getByText("Niveau : Modéré")).toBeInTheDocument();
    expect(
      screen.getByText("Plusieurs facteurs de vigilance ont été identifiés par l'évaluation automatique indicative."),
    ).toBeInTheDocument();
  });
});

describe("FdrPiecesPage — upload d'une pièce", () => {
  it(
    "sélectionner un fichier envoie un POST multipart avec la bonne catégorie puis rafraîchit la liste",
    async () => {
      const user = userEvent.setup();
      mockDemande(demandeApi());
      mockEvaluationRisque({ score: 25, niveau: "modere", synthese: "Plusieurs facteurs de vigilance." });

      let pieces: PieceJustificativeApi[] = [];
      server.use(
        http.get("*/demandes/:id/pieces/", () => {
          const reponse: PiecesResponseApi = {
            pieces,
            pieces_requises: ["complexite"],
            pieces_manquantes: pieces.length === 0 ? ["complexite"] : [],
            dossier_complet: pieces.length > 0,
          };
          return HttpResponse.json(reponse);
        }),
        http.post("*/demandes/:id/pieces/", async ({ request }) => {
          const formData = await request.formData();
          expect(formData.get("type_piece")).toBe("complexite");
          // Pas de vérification du nom/type du fichier ici : le `File`
          // reconstruit par `request.formData()` (implémentation fetch de
          // MSW/undici) ne préserve pas fidèlement `.name` dans cet
          // environnement de test — seule sa présence est fiable.
          expect(formData.get("fichier")).toBeTruthy();
          const piece: PieceJustificativeApi = {
            id: "piece-1",
            type_piece: "complexite",
            nom_fichier_original: "note-complexite.pdf",
            uploaded_at: "2026-09-17T10:00:00Z",
          };
          pieces = [piece];
          return HttpResponse.json(piece, { status: 201 });
        }),
      );
      renderWizard();
      const champFichier = await screen.findByLabelText("Justificatif lié au caractère atypique du chantier");

      const fichier = new File(["contenu"], "note-complexite.pdf", { type: "application/pdf" });
      await user.upload(champFichier, fichier);

      // Timeout étendu : round-trip complet (upload -> invalidation -> refetch
      // -> re-render) au-delà du délai par défaut de findBy (1000ms) sur une
      // machine chargée (suite complète).
      expect(await screen.findByText("note-complexite.pdf", {}, { timeout: 5000 })).toBeInTheDocument();
      expect(await screen.findByText("Dossier complet", {}, { timeout: 5000 })).toBeInTheDocument();
    },
    15000,
  );
});

describe("FdrPiecesPage — suppression d'une pièce", () => {
  it("Supprimer envoie un DELETE sur la bonne pièce puis rafraîchit la liste", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    mockEvaluationRisque({ score: 25, niveau: "modere", synthese: "Plusieurs facteurs de vigilance." });

    let pieces: PieceJustificativeApi[] = [
      { id: "piece-1", type_piece: "complexite", nom_fichier_original: "note.pdf", uploaded_at: "2026-09-17T10:00:00Z" },
    ];
    server.use(
      http.get("*/demandes/:id/pieces/", () => {
        const reponse: PiecesResponseApi = {
          pieces,
          pieces_requises: ["complexite"],
          pieces_manquantes: pieces.length === 0 ? ["complexite"] : [],
          dossier_complet: pieces.length > 0,
        };
        return HttpResponse.json(reponse);
      }),
      http.delete("*/demandes/:id/pieces/:pieceId", ({ params }) => {
        expect(params.pieceId).toBe("piece-1");
        pieces = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWizard();
    await screen.findByText("note.pdf");

    await user.click(screen.getByRole("button", { name: "Supprimer note.pdf" }));

    await screen.findByText("Dossier incomplet");
    expect(screen.queryByText("note.pdf")).not.toBeInTheDocument();
  });
});

describe("FdrPiecesPage — lecture seule (EN_COURS / TRAITE)", () => {
  it("masque l'upload et la suppression, garde pièces/complétude/risque visibles", async () => {
    mockDemande(demandeApi({ statut: "EN_COURS" }));
    mockPieces({
      pieces: [{ id: "piece-1", type_piece: "complexite", nom_fichier_original: "note.pdf", uploaded_at: "2026-09-17T10:00:00Z" }],
      pieces_requises: ["complexite"],
      pieces_manquantes: [],
      dossier_complet: true,
    });
    mockEvaluationRisque({ score: 25, niveau: "modere", synthese: "Plusieurs facteurs de vigilance." });
    renderWizard();

    expect(await screen.findByText("note.pdf")).toBeInTheDocument();
    expect(screen.getByText("Dossier complet")).toBeInTheDocument();
    expect(screen.getByText("Score : 25 / 100")).toBeInTheDocument();
    expect(screen.queryByLabelText("Justificatif lié au caractère atypique du chantier")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer note.pdf" })).not.toBeInTheDocument();
  });
});
