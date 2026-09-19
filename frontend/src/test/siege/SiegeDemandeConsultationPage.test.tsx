import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DemandeDetail, FormulaireRisqueApi } from "../../api/demandes";
import type { EvaluationRisqueApi } from "../../api/evaluationRisque";
import type { PiecesResponseApi } from "../../api/pieces";
import { AuthProvider } from "../../features/auth/AuthProvider";
import { SiegeDemandeConsultationPage } from "../../pages/SiegeDemandeConsultationPage/SiegeDemandeConsultationPage";
import { SiegeHome } from "../../pages/SiegeHome/SiegeHome";
import { createQueryClient } from "../../queryClient";
import { server } from "../server";
import { seedSession } from "../utils";

const ID_DEMANDE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const FDR_COMPLET: FormulaireRisqueApi = {
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
  decision: null,
  motif_refus: "",
  complement_actif: null,
  created_at: "2026-09-10T08:00:00Z",
  updated_at: "2026-09-12T10:30:00Z",
  envoye_at: "2026-09-17T12:15:00Z",
  last_relance_at: null,
  commentaire_distributeur: "",
  fdr: FDR_COMPLET,
  ...overrides,
});

const renderPage = (accueilReel = false) =>
  render(
    <AuthProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[`/siege/demandes/${ID_DEMANDE}`]}>
          <Routes>
            <Route path="/siege" element={accueilReel ? <SiegeHome /> : <p>Demandes à traiter (page)</p>} />
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

  it("propose les actions SIÈGE sans validation finale", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();
    await screen.findByRole("heading", { name: "Récapitulatif des informations" });

    expect(screen.queryByRole("button", { name: /Relancer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Créer le projet/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Modifier le projet/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Demander des compléments" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refuser" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accepter/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Préparer l'attestation" })).toBeInTheDocument();
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

describe("SiegeDemandeConsultationPage — traitement", () => {
  beforeEach(() => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
  });

  const complement = {
    id: "complement-1",
    message: "Précisez la nature des travaux.",
    requested_at: "2026-09-19T10:00:00Z",
    received_at: null,
  };

  it("affiche les deux actions pour EN_COURS avec decision null et aucun complément", async () => {
    mockDemande(demandeApi({ statut: "EN_COURS", decision: null, complement_actif: null }));
    renderPage();

    expect(await screen.findByRole("heading", { name: "Traitement de la demande" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Demander des compléments" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Refuser" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Compléments demandés" })).not.toBeInTheDocument();
  });

  it("valide le message puis envoie le complément, reste sur le détail et conserve le refus", async () => {
    const user = userEvent.setup();
    const poster = vi.fn(async ({ request }: { request: Request }) => {
      expect(await request.json()).toEqual({ message: complement.message });
      return HttpResponse.json(demandeApi({ complement_actif: complement }), { status: 201 });
    });
    server.use(http.post("*/siege/demandes/:id/demander-complements/", poster));
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Demander des compléments" }));
    const dialog = screen.getByRole("dialog", { name: "Demander des compléments" });
    const champ = within(dialog).getByRole("textbox", { name: /Précisez les informations ou documents complémentaires attendus/ });
    expect(champ).toBeRequired();
    await user.type(champ, "   ");
    await user.click(within(dialog).getByRole("button", { name: "Envoyer la demande de compléments" }));
    expect(await screen.findByText("Le message est obligatoire.")).toBeInTheDocument();
    expect(poster).not.toHaveBeenCalled();
    await user.type(champ, complement.message);
    await user.click(within(dialog).getByRole("button", { name: "Envoyer la demande de compléments" }));
    expect(await screen.findByText("La demande de compléments a été envoyée au distributeur.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Compléments demandés" })).toBeInTheDocument();
    expect(screen.getByText(complement.message)).toBeInTheDocument();
    expect(screen.getByText(/Demandés le 19\/09\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refuser" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Demander des compléments" })).not.toBeInTheDocument();
    expect(screen.getByText("En cours")).toBeInTheDocument();
    expect(poster).toHaveBeenCalledTimes(1);
  });

  it("affiche un complément déjà actif, masque une deuxième demande et conserve le refus", async () => {
    mockDemande(demandeApi({ complement_actif: complement }));
    renderPage();
    expect(await screen.findByText(complement.message)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refuser" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Demander des compléments" })).not.toBeInTheDocument();
  });

  it("valide le motif, confirme le refus et revient à /siege avec un message fermable", async () => {
    const user = userEvent.setup();
    const poster = vi.fn(async ({ request }: { request: Request }) => {
      expect(await request.json()).toEqual({ motif: "Risque non couvert" });
      return HttpResponse.json(demandeApi({ decision: "REFUSEE", statut: "TRAITE", motif_refus: "Risque non couvert" }));
    });
    server.use(
      http.post("*/siege/demandes/:id/refuser/", poster),
      http.get("*/siege/demandes/", () => HttpResponse.json({ count: 0, results: [], next: null, previous: null })),
    );
    renderPage(true);
    await user.click(await screen.findByRole("button", { name: "Refuser" }));
    const dialog = screen.getByRole("dialog", { name: "Refuser la demande" });
    expect(within(dialog).getByText(/Confirmez le refus/)).toBeInTheDocument();
    const champ = within(dialog).getByRole("textbox", { name: /Motif du refus/ });
    expect(champ).toBeRequired();
    await user.type(champ, "   ");
    await user.click(within(dialog).getByRole("button", { name: "Confirmer le refus" }));
    expect(await screen.findByText("Le motif est obligatoire.")).toBeInTheDocument();
    expect(poster).not.toHaveBeenCalled();
    await user.type(champ, "Risque non couvert  ");
    await user.click(within(dialog).getByRole("button", { name: "Confirmer le refus" }));
    expect(await screen.findByRole("heading", { name: /^Demandes à traiter/ })).toBeInTheDocument();
    expect(screen.getByText("Demande refusée.")).toBeInTheDocument();
    expect(await screen.findByText("Aucune demande pour le moment.")).toBeInTheDocument();
    expect(poster).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByText("Demande refusée.")).not.toBeInTheDocument();
  });

  it("affiche proprement le conflit 409 d'une deuxième demande de compléments simultanée", async () => {
    const user = userEvent.setup();
    const detail = "Des compléments sont déjà demandés. Attendez la réponse du distributeur.";
    server.use(http.post("*/siege/demandes/:id/demander-complements/", () => HttpResponse.json(
      { code: "COMPLEMENTS_DEJA_DEMANDES", detail }, { status: 409 },
    )));
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Demander des compléments" }));
    await user.type(within(screen.getByRole("dialog")).getByRole("textbox"), "Texte");
    await user.click(screen.getByRole("button", { name: "Envoyer la demande de compléments" }));
    expect(await screen.findByText(detail)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("Demande refusée.")).not.toBeInTheDocument();
  });

  it("annule une modale sans envoyer de requête", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Refuser" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refuser" })).toBeInTheDocument();
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
