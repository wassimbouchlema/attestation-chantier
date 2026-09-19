import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, delay, http } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DemandeDetail, FormulaireRisqueApi } from "../../api/demandes";
import type { EvaluationRisqueApi } from "../../api/evaluationRisque";
import type { PiecesResponseApi } from "../../api/pieces";
import type { ProjetAttestationApi } from "../../api/projetAttestation";
import { AuthProvider } from "../../features/auth/AuthProvider";
import { DemandeConsultationPage } from "../../pages/DemandeConsultationPage/DemandeConsultationPage";
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
  statut: "EN_COURS",
  created_at: "2026-09-10T08:00:00Z",
  updated_at: "2026-09-12T10:30:00Z",
  // Heure choisie loin de minuit UTC : évite qu'un fuseau horaire local
  // différent du runner de test ne fasse basculer le jour affiché.
  envoye_at: "2026-09-17T12:15:00Z",
  last_relance_at: null,
  commentaire_distributeur: "",
  fdr: FDR_COMPLET,
  ...overrides,
});

/** Restitue l'URL courante après une navigation `replace` (nettoyage du state d'historique). */
const UrlActuelleStub = () => {
  const location = useLocation();
  return <p>URL actuelle : {location.pathname}</p>;
};

const renderPage = (
  chemin: string | { pathname: string; state?: unknown } = `/distributeur/demandes/${ID_DEMANDE}/consultation`,
) =>
  render(
    <AuthProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[chemin]}>
          <Routes>
            <Route path="/distributeur" element={<p>Mes demandes (page)</p>} />
            <Route
              path="/distributeur/demandes/:id/consultation"
              element={
                <>
                  <DemandeConsultationPage />
                  <UrlActuelleStub />
                </>
              }
            />
            <Route path="/distributeur/demandes/:id/projet-attestation" element={<p>Éditeur du projet (page)</p>} />
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

const mockProjetAttestation = (reponse: ProjetAttestationApi | null) => {
  server.use(
    http.get("*/demandes/:id/projet-attestation/", () =>
      reponse ? HttpResponse.json(reponse) : new HttpResponse(null, { status: 404 }),
    ),
  );
};

const PIECES_COMPLETES: PiecesResponseApi = {
  pieces: [{ id: "piece-1", type_piece: "complexite", nom_fichier_original: "note.pdf", uploaded_at: "2026-09-17T10:00:00Z" }],
  pieces_requises: ["complexite"],
  pieces_manquantes: [],
  dossier_complet: true,
};

const EVALUATION: EvaluationRisqueApi = { score: 10, niveau: "faible", synthese: "Aucun facteur." };

let clicDeTelechargement: { download: string; href: string } | null;
let ouvertureOnglet: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  seedSession("DISTRIBUTEUR");
  clicDeTelechargement = null;
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();
  ouvertureOnglet = vi.spyOn(window, "open").mockReturnValue(null);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicDeTelechargement = { download: this.download, href: this.href };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DemandeConsultationPage — affichage lecture seule", () => {
  it("affiche le statut, la date d'envoi, le récapitulatif, les pièces, le risque et le commentaire", async () => {
    mockDemande(demandeApi({ commentaire_distributeur: "Dossier urgent, merci." }));
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();

    expect(await screen.findByText("En cours")).toBeInTheDocument();
    expect(screen.getByText("Envoyée le")).toBeInTheDocument();
    expect(screen.getByText(/17\/09\/2026/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Récapitulatif des informations" })).toBeInTheDocument();
    expect(screen.getByText("AXA Construction")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pièces justificatives" })).toBeInTheDocument();
    // Pièces/risque : requêtes propres à chaque section, distinctes de celle
    // de la demande déjà attendue ci-dessus — attendre spécifiquement leur résultat.
    expect(await screen.findByText("Complet")).toBeInTheDocument();
    expect(screen.getByText("note.pdf")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Date d'ajout" })).toBeInTheDocument();
    expect(await screen.findByText("Faible")).toBeInTheDocument();
    expect(screen.getByText("10 / 100")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Commentaire distributeur" })).toBeInTheDocument();
    expect(screen.getByText("Dossier urgent, merci.")).toBeInTheDocument();
  });

  it("dossier complet : Tag 'Complet' compact, pas de bandeau permanent 'Dossier complet'", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();

    expect(await screen.findByText("Complet")).toBeInTheDocument();
    expect(screen.queryByText("Toutes les pièces justificatives requises ont été transmises.")).not.toBeInTheDocument();
  });

  it("n'affiche pas de bloc Commentaire distributeur si aucun commentaire n'a été renseigné", async () => {
    mockDemande(demandeApi({ commentaire_distributeur: "" }));
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();
    await screen.findByRole("heading", { name: "Récapitulatif des informations" });

    expect(screen.queryByRole("heading", { name: "Commentaire distributeur" })).not.toBeInTheDocument();
  });

  it("aucune édition FDR ni upload/suppression de pièces", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();

    expect(await screen.findByText("note.pdf")).toBeInTheDocument();
    expect(screen.queryByLabelText("Justificatif lié au caractère atypique du chantier")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer note.pdf" })).not.toBeInTheDocument();
  });

  it("affiche la demande de compléments du siège en lecture seule", async () => {
    const complement = {
      id: "complement-1",
      message: "Merci de préciser la nature exacte des travaux.",
      requested_at: "2026-09-19T10:00:00Z",
      received_at: null,
    };
    mockDemande(demandeApi({ complement_actif: complement }));
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();

    expect(await screen.findByRole("heading", { name: "Compléments demandés par le siège" })).toBeInTheDocument();
    expect(screen.getByText("Demandés le")).toBeInTheDocument();
    expect(screen.getByText("19/09/2026 à 12:00")).toBeInTheDocument();
    expect(screen.getByText(complement.message)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Envoyer.*complément/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Téléverser|Parcourir/i)).not.toBeInTheDocument();
  });

  it("demande introuvable (404) affiche un message dédié", async () => {
    server.use(http.get("*/demandes/:id/", () => new HttpResponse(null, { status: 404 })));
    renderPage();

    expect(await screen.findByText("Cette demande est introuvable.")).toBeInTheDocument();
  });
});

describe("DemandeConsultationPage — message d'envoi (état de navigation)", () => {
  it("affiche le message ponctuel transmis après un envoi réussi, puis nettoie le state d'historique", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage({
      pathname: `/distributeur/demandes/${ID_DEMANDE}/consultation`,
      state: { successMessage: "Demande envoyée au siège. Votre demande est désormais en cours de traitement." },
    });

    expect(
      await screen.findByText("Demande envoyée au siège. Votre demande est désormais en cours de traitement."),
    ).toBeInTheDocument();
    expect(await screen.findByText(`URL actuelle : /distributeur/demandes/${ID_DEMANDE}/consultation`)).toBeInTheDocument();
  });

  it("n'affiche aucun message quand la page est ouverte sans état de navigation", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();
    await screen.findByRole("heading", { name: "Récapitulatif des informations" });

    expect(screen.queryByText(/Demande envoyée au siège/)).not.toBeInTheDocument();
  });
});

describe("DemandeConsultationPage — PDF", () => {
  it("Prévisualiser récupère le PDF et l'ouvre dans un nouvel onglet via un Blob", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    server.use(
      http.get("*/demandes/:id/fdr-pdf/", () => new HttpResponse("%PDF-1.4 contenu", { headers: { "Content-Type": "application/pdf" } })),
    );
    renderPage();
    await screen.findByRole("button", { name: "Prévisualiser" });

    await user.click(screen.getByRole("button", { name: "Prévisualiser" }));

    await vi.waitFor(() => expect(ouvertureOnglet).toHaveBeenCalledWith("blob:mock-url", "_blank"));
  });

  it("Télécharger déclenche un téléchargement nommé FDR-<id>.pdf", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    server.use(
      http.get("*/demandes/:id/fdr-pdf/", () => new HttpResponse("%PDF-1.4 contenu", { headers: { "Content-Type": "application/pdf" } })),
    );
    renderPage();
    await screen.findByRole("button", { name: "Télécharger" });

    await user.click(screen.getByRole("button", { name: "Télécharger" }));

    await vi.waitFor(() => expect(clicDeTelechargement).not.toBeNull());
    expect(clicDeTelechargement?.download).toBe(`FDR-${ID_DEMANDE}.pdf`);
    expect(clicDeTelechargement?.href).toContain("blob:mock-url");
  });

  it("affiche une erreur explicite si le PDF n'est pas disponible", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    server.use(http.get("*/demandes/:id/fdr-pdf/", () => new HttpResponse(null, { status: 404 })));
    renderPage();
    await screen.findByRole("button", { name: "Prévisualiser" });

    await user.click(screen.getByRole("button", { name: "Prévisualiser" }));

    expect(await screen.findByText("Aucun document n'est disponible pour cette demande.")).toBeInTheDocument();
  });
});

describe("DemandeConsultationPage — relance", () => {
  it("EN_COURS jamais relancée : 'Dernière relance : Aucune', bouton actif", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();

    expect(await screen.findByRole("heading", { name: "Suivi de la demande" })).toBeInTheDocument();
    expect(screen.getByText("Aucune")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Relancer le siège" })).not.toBeDisabled();
  });

  it("clic Relancer : POST /relancer/, bouton désactivé pendant la mutation, succès affiche le message et met à jour le détail", async () => {
    const user = userEvent.setup();
    let appelsRelance = 0;
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    server.use(
      http.post("*/demandes/:id/relancer/", async () => {
        appelsRelance += 1;
        await delay(50);
        return HttpResponse.json({ ...demandeApi(), last_relance_at: "2026-09-18T15:00:00Z" });
      }),
    );
    renderPage();
    await screen.findByRole("button", { name: "Relancer le siège" });

    await user.click(screen.getByRole("button", { name: "Relancer le siège" }));

    expect(screen.getByRole("button", { name: "Relance en cours…" })).toBeDisabled();
    expect(await screen.findByText("Relance envoyée au siège.")).toBeInTheDocument();
    expect(await screen.findByText(/Dernière relance/)).toBeInTheDocument();
    expect(appelsRelance).toBe(1);
  });

  it("last_relance_at de moins de 24h : bouton désactivé, prochaine date de relance affichée", async () => {
    const ilYA1Heure = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockDemande(demandeApi({ last_relance_at: ilYA1Heure }));
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();

    await screen.findByRole("heading", { name: "Suivi de la demande" });
    expect(screen.getByRole("button", { name: "Relancer le siège" })).toBeDisabled();
    expect(screen.getByText("Nouvelle relance possible le")).toBeInTheDocument();
  });

  it("TRAITE : masque la prochaine relance et le bouton, conserve la dernière relance", async () => {
    const ilYA1Heure = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockDemande(demandeApi({ statut: "TRAITE", decision: "REFUSEE", last_relance_at: ilYA1Heure }));
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();

    await screen.findByRole("heading", { name: "Suivi de la demande" });
    expect(screen.getByText("Dernière relance")).toBeInTheDocument();
    expect(screen.queryByText("Nouvelle relance possible le")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Relancer le siège" })).not.toBeInTheDocument();
  });

  it("cooldown refusé par le backend (409 DELAI_RELANCE_NON_ECOULE) : message avec la date reçue du serveur", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    server.use(
      http.post("*/demandes/:id/relancer/", () =>
        HttpResponse.json(
          {
            code: "DELAI_RELANCE_NON_ECOULE",
            detail: "Une nouvelle relance pourra être envoyée ultérieurement.",
            prochaine_relance_at: "2026-09-19T15:00:00Z",
          },
          { status: 409 },
        ),
      ),
    );
    renderPage();
    await screen.findByRole("button", { name: "Relancer le siège" });

    await user.click(screen.getByRole("button", { name: "Relancer le siège" }));

    expect(
      await screen.findByText(/Une nouvelle relance sera possible le 19\/09\/2026/),
    ).toBeInTheDocument();
  });

  it("statut différent de EN_COURS : aucune action Relancer", async () => {
    mockDemande(demandeApi({ statut: "TRAITE" }));
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();

    await screen.findByRole("heading", { name: "Suivi de la demande" });
    expect(screen.queryByRole("button", { name: /Relancer/ })).not.toBeInTheDocument();
  });
});

describe("DemandeConsultationPage — projet d'attestation", () => {
  it("EN_COURS sans projet : proposition de création", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    mockProjetAttestation(null);
    renderPage();

    expect(await screen.findByRole("heading", { name: "Projet d'attestation" })).toBeInTheDocument();
    expect(
      screen.getByText("Préparez un projet d'attestation à partir des informations du FDR."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer le projet" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier le projet" })).not.toBeInTheDocument();
  });

  it("clic sur Créer le projet : POST puis navigation vers l'éditeur", async () => {
    const user = userEvent.setup();
    let appelsCreation = 0;
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    mockProjetAttestation(null);
    server.use(
      http.post("*/demandes/:id/projet-attestation/", () => {
        appelsCreation += 1;
        return HttpResponse.json(
          { contenu_html: "<h1>Projet</h1>", created_at: "2026-09-18T10:00:00Z", updated_at: "2026-09-18T10:00:00Z" },
          { status: 201 },
        );
      }),
    );
    renderPage();
    await screen.findByRole("button", { name: "Créer le projet" });

    await user.click(screen.getByRole("button", { name: "Créer le projet" }));

    expect(await screen.findByText("Éditeur du projet (page)")).toBeInTheDocument();
    expect(appelsCreation).toBe(1);
  });

  it("projet déjà existant : proposition de modification, pas de création", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    mockProjetAttestation({
      contenu_html: "<h1>Projet</h1>",
      created_at: "2026-09-18T09:00:00Z",
      updated_at: "2026-09-18T10:30:00Z",
    });
    renderPage();

    expect(await screen.findByRole("button", { name: "Modifier le projet" })).toBeInTheDocument();
    expect(screen.getByText("Dernière modification")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Créer le projet" })).not.toBeInTheDocument();
  });

  it("statut BROUILLON : aucune section Projet d'attestation", async () => {
    mockDemande(demandeApi({ statut: "BROUILLON" }));
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    mockProjetAttestation(null);
    renderPage();

    await screen.findByRole("heading", { name: "Récapitulatif des informations" });
    expect(screen.queryByRole("heading", { name: "Projet d'attestation" })).not.toBeInTheDocument();
  });
});

describe("DemandeConsultationPage — retour", () => {
  it("Retour à mes demandes navigue vers /distributeur", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();
    await screen.findByRole("button", { name: "Retour à mes demandes" });

    await user.click(screen.getByRole("button", { name: "Retour à mes demandes" }));

    expect(await screen.findByText("Mes demandes (page)")).toBeInTheDocument();
  });
});

describe("DemandeConsultationPage — attestation définitive", () => {
  const acceptee = () => demandeApi({
    statut: "TRAITE",
    decision: "ACCEPTEE",
    attestation_finale: { validated_at: "2026-09-19T10:00:00Z" },
  });

  it("affiche l'attestation définitive puis la prévisualise et la télécharge via le Blob authentifié", async () => {
    mockDemande(acceptee());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    const pdf = vi.fn(() => new HttpResponse("%PDF-1.4 final", { headers: { "Content-Type": "application/pdf" } }));
    server.use(http.get("*/demandes/:id/attestation-finale/pdf/", pdf));
    const user = userEvent.setup();
    renderPage();

    const titre = await screen.findByRole("heading", { name: "Attestation définitive" });
    const section = titre.closest(".surface") as HTMLElement;
    expect(within(section).getByText("Statut")).toBeInTheDocument();
    expect(within(section).getByText("Demande acceptée")).toBeInTheDocument();
    expect(within(section).getByText("Date de validation")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Projet d'attestation" })).not.toBeInTheDocument();

    await user.click(within(section).getByRole("button", { name: "Prévisualiser" }));
    await waitFor(() => expect(ouvertureOnglet).toHaveBeenCalledWith("blob:mock-url", "_blank"));
    await user.click(within(section).getByRole("button", { name: "Télécharger" }));
    await waitFor(() => expect(clicDeTelechargement?.download).toBe(`attestation-definitive-${ID_DEMANDE}.pdf`));
    expect(pdf).toHaveBeenCalledTimes(2);
  });

  it("n'affiche aucune attestation définitive pour une demande refusée", async () => {
    mockDemande(demandeApi({ statut: "TRAITE", decision: "REFUSEE", motif_refus: "Hors périmètre." }));
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();
    await screen.findByText("Tour Horizon");
    expect(screen.queryByRole("heading", { name: "Attestation définitive" })).not.toBeInTheDocument();
  });

  it("acceptée : affiche la décision Acceptée sans motif, entre le suivi et le récapitulatif FDR", async () => {
    mockDemande(acceptee());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    mockProjetAttestation(null);
    renderPage();

    const decision = await screen.findByRole("heading", { name: "Décision du siège" });
    const section = decision.closest(".surface") as HTMLElement;
    expect(within(section).getByText("Acceptée")).toBeInTheDocument();
    expect(screen.queryByText("Motif du refus")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Attestation définitive" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Projet d'attestation" })).not.toBeInTheDocument();
    const ordre = ["Suivi de la demande", "Décision du siège", "Attestation définitive", "Récapitulatif des informations",
      "Pièces justificatives", "Évaluation automatique du risque", "Document transmis"];
    const titres = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titres.filter((t) => ordre.includes(t ?? ""))).toEqual(ordre);
  });
});

describe("DemandeConsultationPage — décision de refus", () => {
  const motif = "Chantier hors périmètre.\nMerci de déposer une nouvelle demande.";

  it("affiche la décision et le motif multiligne en lecture seule, sans attestation définitive", async () => {
    mockDemande(demandeApi({ statut: "TRAITE", decision: "REFUSEE", motif_refus: motif }));
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    mockProjetAttestation(null);
    renderPage();

    const titre = await screen.findByRole("heading", { name: "Décision du siège" });
    const section = titre.closest(".surface") as HTMLElement;
    expect(within(section).getByText("Refusée")).toBeInTheDocument();
    expect(within(section).getByText("Motif du refus")).toBeInTheDocument();
    const texteMotif = within(section).getByText(/Chantier hors périmètre\./);
    expect(texteMotif.textContent).toBe(motif);
    expect(texteMotif).toHaveClass("consultation-multiligne");
    expect(within(section).queryByRole("button")).not.toBeInTheDocument();
    expect(within(section).queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Attestation définitive" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Projet d'attestation" })).not.toBeInTheDocument();
  });

  it("refusée : masque totalement le projet d'attestation, même existant", async () => {
    mockDemande(demandeApi({ statut: "TRAITE", decision: "REFUSEE", motif_refus: "Refus." }));
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    mockProjetAttestation({
      contenu_html: "<p>x</p>", created_at: "2026-09-13T08:00:00Z", updated_at: "2026-09-14T08:00:00Z",
    });
    renderPage();

    const decision = await screen.findByRole("heading", { name: "Décision du siège" });
    const recap = screen.getByRole("heading", { name: "Récapitulatif des informations" });
    expect(decision.compareDocumentPosition(recap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Projet d'attestation" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /projet/i })).not.toBeInTheDocument();
  });

  it.each(["EN_COURS", "BROUILLON"] as const)("%s : aucun bloc de décision définitive", async (statut) => {
    mockDemande(demandeApi({ statut, decision: null }));
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    mockProjetAttestation(null);
    renderPage();

    await screen.findByText("Tour Horizon");
    expect(screen.queryByRole("heading", { name: "Décision du siège" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Attestation définitive" })).not.toBeInTheDocument();
  });
});

describe("DemandeConsultationPage — compléments et disposition des documents", () => {
  const complement = {
    id: "complement-1",
    message: "Précisez la nature des travaux.\nJoignez le devis signé.",
    requested_at: "2026-09-19T10:00:00Z",
    received_at: null,
  };
  const titresH2 = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

  it("EN_COURS avec complément : le complément suit le suivi, avant le récapitulatif", async () => {
    mockDemande(demandeApi({ complement_actif: complement }));
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    mockProjetAttestation(null);
    renderPage();

    const titre = await screen.findByRole("heading", { name: "Compléments demandés par le siège" });
    const ordre = ["Suivi de la demande", "Compléments demandés par le siège", "Récapitulatif des informations"];
    expect(titresH2().filter((t) => ordre.includes(t ?? ""))).toEqual(ordre);
    const section = titre.closest(".surface") as HTMLElement;
    expect(within(section).getByText("Demandés le")).toBeInTheDocument();
    expect(within(section).getByText("Demande du siège")).toBeInTheDocument();
    const message = within(section).getByText(/Précisez la nature des travaux\./);
    expect(message.textContent).toBe(complement.message);
    expect(message).toHaveClass("consultation-multiligne");
  });

  it("TRAITE accepté avec complément : décision, attestation, puis complément, avant le récapitulatif", async () => {
    mockDemande(demandeApi({
      statut: "TRAITE",
      decision: "ACCEPTEE",
      attestation_finale: { validated_at: "2026-09-19T10:00:00Z" },
      complement_actif: complement,
    }));
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();

    await screen.findByRole("heading", { name: "Compléments demandés par le siège" });
    const ordre = [
      "Suivi de la demande", "Décision du siège", "Attestation définitive",
      "Compléments demandés par le siège", "Récapitulatif des informations",
    ];
    expect(titresH2().filter((t) => ordre.includes(t ?? ""))).toEqual(ordre);
  });

  it("refusé : pas de projet ni d'attestation, complément éventuel après la décision", async () => {
    mockDemande(demandeApi({ statut: "TRAITE", decision: "REFUSEE", motif_refus: "Refus.", complement_actif: complement }));
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();

    await screen.findByRole("heading", { name: "Compléments demandés par le siège" });
    const titres = titresH2();
    expect(titres.indexOf("Décision du siège")).toBeLessThan(titres.indexOf("Compléments demandés par le siège"));
    expect(titres).not.toContain("Attestation définitive");
    expect(titres).not.toContain("Projet d'attestation");
  });

  it("les blocs de documents partagent la disposition informations | actions", async () => {
    mockDemande(demandeApi({
      statut: "TRAITE",
      decision: "ACCEPTEE",
      attestation_finale: { validated_at: "2026-09-19T10:00:00Z" },
    }));
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();

    for (const nom of ["Attestation définitive", "Document transmis"]) {
      const section = (await screen.findByRole("heading", { name: nom })).closest(".surface") as HTMLElement;
      const disposition = section.querySelector(".consultation-document") as HTMLElement;
      expect(disposition.querySelector(".consultation-document__infos")).toBeInTheDocument();
      const actions = disposition.querySelector(".consultation-document__actions") as HTMLElement;
      expect(within(actions).getByRole("button", { name: "Prévisualiser" })).toBeInTheDocument();
      expect(within(actions).getByRole("button", { name: "Télécharger" })).toBeInTheDocument();
    }
    expect(screen.getByText("Formulaire de déclaration du risque")).toBeInTheDocument();
  });
});

describe("DemandeConsultationPage — actions des blocs Suivi et Projet", () => {
  const actionsDe = async (titre: string) => {
    const section = (await screen.findByRole("heading", { name: titre })).closest(".surface") as HTMLElement;
    return section.querySelector(".consultation-document__actions") as HTMLElement;
  };

  it("Suivi : Relancer le siège est dans la colonne d'actions", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    mockProjetAttestation(null);
    renderPage();

    expect(within(await actionsDe("Suivi de la demande")).getByRole("button", { name: "Relancer le siège" })).toBeEnabled();
  });

  it("Projet : Créer / Modifier le projet sont dans la colonne d'actions", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    mockProjetAttestation(null);
    const { unmount } = renderPage();
    expect(within(await actionsDe("Projet d'attestation")).getByRole("button", { name: "Créer le projet" })).toBeInTheDocument();
    unmount();

    mockProjetAttestation({ contenu_html: "<p>x</p>", created_at: "2026-09-13T08:00:00Z", updated_at: "2026-09-14T08:00:00Z" });
    renderPage();
    expect(within(await actionsDe("Projet d'attestation")).getByRole("button", { name: "Modifier le projet" })).toBeInTheDocument();
  });

  it("TRAITE : pas de bouton Relancer dans le suivi", async () => {
    mockDemande(demandeApi({ statut: "TRAITE", decision: "REFUSEE", motif_refus: "Refus." }));
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderPage();

    await screen.findByRole("heading", { name: "Suivi de la demande" });
    expect(screen.queryByRole("button", { name: "Relancer le siège" })).not.toBeInTheDocument();
  });
});
