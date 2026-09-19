import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DemandeDetail, FormulaireRisqueApi } from "../../api/demandes";
import { AuthProvider } from "../../features/auth/AuthProvider";
import { ProjetAttestationPage } from "../../pages/ProjetAttestationPage/ProjetAttestationPage";
import { createQueryClient } from "../../queryClient";
import { UTILISATEUR_DISTRIBUTEUR } from "../handlers";
import { server } from "../server";
import { seedSession } from "../utils";

const ID_DEMANDE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
// Corps éditable seul : les titres et le pied de page appartiennent au
// gabarit fixe, jamais à `contenu_html` (sinon ils s'afficheraient en double).
const CONTENU_INITIAL = "<p>AXA France atteste que la société est couverte.</p>";

/**
 * L'éditeur réel (Quill) est utilisé, jamais mocké : les assertions portent
 * sur notre comportement autour de lui (contenu hydraté, contenu envoyé,
 * état modifié), pas sur ses internals.
 */
const attendreEditeur = async (): Promise<HTMLElement> => {
  await waitFor(() => expect(document.querySelector(".ql-editor")).toBeInTheDocument());
  return document.querySelector(".ql-editor") as HTMLElement;
};

const renderPage = (chemin = `/distributeur/demandes/${ID_DEMANDE}/projet-attestation`) =>
  render(
    <AuthProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[chemin]}>
          <Routes>
            <Route
              path="/distributeur/demandes/:id/consultation"
              element={<p>Consultation de la demande (page)</p>}
            />
            <Route path="/distributeur/demandes/:id/projet-attestation" element={<ProjetAttestationPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthProvider>,
  );

const mockProjet = (contenuHtml = CONTENU_INITIAL) => {
  server.use(
    http.get("*/demandes/:id/projet-attestation/", () =>
      HttpResponse.json({
        contenu_html: contenuHtml,
        created_at: "2026-09-18T09:00:00Z",
        updated_at: "2026-09-18T09:00:00Z",
      }),
    ),
  );
};

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
  statut: "EN_COURS",
  created_at: "2026-09-10T08:00:00Z",
  updated_at: "2026-09-12T10:30:00Z",
  envoye_at: "2026-09-17T12:15:00Z",
  last_relance_at: null,
  commentaire_distributeur: "",
  fdr: FDR_COMPLET,
  ...overrides,
});

const mockDemande = (demande: DemandeDetail = demandeApi()) => {
  server.use(http.get("*/demandes/:id/", () => HttpResponse.json(demande)));
};

// Même dispositif que les tests du PDF FDR : `URL.createObjectURL` n'existe
// pas sous jsdom, et le clic de téléchargement est intercepté pour vérifier le
// nom de fichier sans déclencher de navigation.
let clicDeTelechargement: { download: string; href: string } | null = null;
let ouvertureOnglet: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  seedSession("DISTRIBUTEUR");
  clicDeTelechargement = null;
  URL.createObjectURL = vi.fn(() => "blob:projet");
  URL.revokeObjectURL = vi.fn();
  ouvertureOnglet = vi.spyOn(window, "open").mockReturnValue(null);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicDeTelechargement = { download: this.download, href: this.href };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProjetAttestationPage — chargement", () => {
  it("charge et affiche le contenu existant dans l'éditeur", async () => {
    mockProjet();
    renderPage();

    expect(await attendreEditeur()).toHaveTextContent("AXA France atteste que la société est couverte.");
  });

  it("affiche un message dédié si le projet est introuvable", async () => {
    server.use(http.get("*/demandes/:id/projet-attestation/", () => new HttpResponse(null, { status: 404 })));
    renderPage();

    expect(await screen.findByText("Ce projet d'attestation est introuvable.")).toBeInTheDocument();
  });

  it("affiche une erreur réseau/serveur générique avec un bouton Réessayer", async () => {
    server.use(http.get("*/demandes/:id/projet-attestation/", () => new HttpResponse(null, { status: 500 })));
    renderPage();

    const message = await screen.findByText("Impossible de récupérer le projet d'attestation.");
    expect(message.closest('[role="alert"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });
});

describe("ProjetAttestationPage — gabarit documentaire", () => {
  it("affiche le logo, l'agent connecté, les références du contrat, le destinataire et l'objet à partir du FDR de la demande", async () => {
    mockProjet();
    mockDemande();
    renderPage();

    await attendreEditeur();

    expect(screen.getByAltText("AXA")).toBeInTheDocument();
    expect(screen.getByText("Votre agent général")).toBeInTheDocument();
    expect(
      screen.getByText(`${UTILISATEUR_DISTRIBUTEUR.first_name} ${UTILISATEUR_DISTRIBUTEUR.last_name}`),
    ).toBeInTheDocument();
    expect(screen.getByText("Votre contrat")).toBeInTheDocument();
    expect(screen.getByText("Vos références")).toBeInTheDocument();
    expect(screen.getByText(`Contrat n° ${FDR_COMPLET.assure_numero_contrat}`)).toBeInTheDocument();
    expect(screen.getByText("Assuré")).toBeInTheDocument();
    expect(screen.getByText(FDR_COMPLET.assure_nom)).toBeInTheDocument();
    expect(screen.getByText(FDR_COMPLET.assure_ville)).toBeInTheDocument();
    expect(screen.getByText("Date du courrier")).toBeInTheDocument();
    expect(screen.getByText(`Attestation d'assurance — Chantier ${FDR_COMPLET.chantier_nom}`)).toBeInTheDocument();
  });

  it("porte les titres et le pied de page dans la feuille, hors du contenu éditable (aucun doublon)", async () => {
    mockProjet();
    mockDemande();
    renderPage();

    const editeur = await attendreEditeur();
    const feuille = document.querySelector(".projet-attestation-feuille") as HTMLElement;

    // Dans la feuille, chaque titre/pied de page n'apparaît qu'une fois et
    // jamais dans la zone Quill : `contenu_html` ne les contient plus, sinon
    // ils s'afficheraient en double (gabarit + contenu).
    for (const texte of [
      "Projet d'attestation",
      "Attestation d'assurance",
      "Validation définitive : réservée au siège.",
    ]) {
      const dansLaFeuille = screen.getAllByText(texte).filter((element) => feuille.contains(element));
      expect(dansLaFeuille).toHaveLength(1);
      expect(editeur.contains(dansLaFeuille[0])).toBe(false);
    }
  });
});

describe("ProjetAttestationPage — distinction projet / définitif", () => {
  it("affiche toujours un rappel explicite que ce document n'est pas définitif", async () => {
    mockProjet();
    renderPage();

    await attendreEditeur();
    expect(
      screen.getByText("Ce document est un projet. L'attestation définitive sera validée par le siège."),
    ).toBeInTheDocument();
    // Deux marquages complémentaires : le Tag applicatif du PageHeader et la
    // mention portée par la feuille elle-même (visible sur le document seul).
    expect(screen.getAllByText("Non définitif")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Valider/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /définitive/i })).not.toBeInTheDocument();
  });
});

describe("ProjetAttestationPage — enregistrement", () => {
  it("Enregistrer sans modification envoie le contenu déjà chargé et affiche un succès", async () => {
    const user = userEvent.setup();
    let corpsRecu: Record<string, unknown> | null = null;
    mockProjet();
    server.use(
      http.patch("*/demandes/:id/projet-attestation/", async ({ request }) => {
        corpsRecu = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          contenu_html: corpsRecu.contenu_html,
          created_at: "2026-09-18T09:00:00Z",
          updated_at: "2026-09-18T11:00:00Z",
        });
      }),
    );
    renderPage();
    await attendreEditeur();

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Projet d'attestation enregistré.")).toBeInTheDocument();
    const corps: Record<string, unknown> = corpsRecu as unknown as Record<string, unknown>;
    expect(corps.contenu_html).toBe(CONTENU_INITIAL);
  });

  it("une modification dans l'éditeur est bien celle envoyée à Enregistrer", async () => {
    const user = userEvent.setup();
    let corpsRecu: Record<string, unknown> | null = null;
    mockProjet();
    server.use(
      http.patch("*/demandes/:id/projet-attestation/", async ({ request }) => {
        corpsRecu = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          contenu_html: corpsRecu.contenu_html,
          created_at: "2026-09-18T09:00:00Z",
          updated_at: "2026-09-18T11:00:00Z",
        });
      }),
    );
    renderPage();
    const editeur = await attendreEditeur();

    await user.click(editeur);
    await user.type(editeur, "Ajout du distributeur.");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await screen.findByText("Projet d'attestation enregistré.");
    const corps: Record<string, unknown> = corpsRecu as unknown as Record<string, unknown>;
    expect(corps.contenu_html).toContain("Ajout du distributeur.");
  });

  it("désactive Enregistrer pendant la mutation", async () => {
    const user = userEvent.setup();
    mockProjet();
    server.use(
      http.patch("*/demandes/:id/projet-attestation/", async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ contenu_html: CONTENU_INITIAL, created_at: "x", updated_at: "y" });
      }),
    );
    renderPage();
    await attendreEditeur();

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(screen.getByRole("button", { name: "Enregistrement…" })).toBeDisabled();
  });

  it("erreur serveur à l'enregistrement : reste sur la page, message d'erreur affiché", async () => {
    const user = userEvent.setup();
    mockProjet();
    server.use(http.patch("*/demandes/:id/projet-attestation/", () => new HttpResponse(null, { status: 500 })));
    renderPage();
    await attendreEditeur();

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Impossible d'enregistrer le projet d'attestation.")).toBeInTheDocument();
    expect(screen.queryByText("Consultation de la demande (page)")).not.toBeInTheDocument();
  });
});

describe("ProjetAttestationPage — état modifié", () => {
  it("ne signale aucune modification tant que le distributeur n'a pas édité le document", async () => {
    mockProjet();
    renderPage();

    await attendreEditeur();

    expect(screen.queryByText(/Modifications non enregistrées/)).not.toBeInTheDocument();
  });

  it("signale les modifications non enregistrées dès l'édition, puis les efface après un enregistrement réussi", async () => {
    const user = userEvent.setup();
    mockProjet();
    server.use(
      http.patch("*/demandes/:id/projet-attestation/", async ({ request }) => {
        const corps = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          contenu_html: corps.contenu_html,
          created_at: "2026-09-18T09:00:00Z",
          updated_at: "2026-09-18T11:00:00Z",
        });
      }),
    );
    renderPage();
    const editeur = await attendreEditeur();

    await user.click(editeur);
    await user.type(editeur, "Modification.");

    expect(await screen.findByText(/Modifications non enregistrées/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await screen.findByText("Projet d'attestation enregistré.");
    expect(screen.queryByText(/Modifications non enregistrées/)).not.toBeInTheDocument();
  });
});

describe("ProjetAttestationPage — PDF", () => {
  const mockPdf = () => {
    server.use(
      http.get("*/demandes/:id/projet-attestation/pdf/", () =>
        HttpResponse.arrayBuffer(new TextEncoder().encode("%PDF-1.4 projet").buffer as ArrayBuffer, {
          headers: { "Content-Type": "application/pdf" },
        }),
      ),
    );
  };

  it("Prévisualiser récupère le PDF et l'ouvre dans un nouvel onglet", async () => {
    const user = userEvent.setup();
    mockProjet();
    mockPdf();
    renderPage();
    await attendreEditeur();

    await user.click(screen.getByRole("button", { name: "Prévisualiser" }));

    await waitFor(() => expect(ouvertureOnglet).toHaveBeenCalledWith("blob:projet", "_blank"));
  });

  it("Télécharger le projet déclenche un téléchargement nommé d'après la demande", async () => {
    const user = userEvent.setup();
    mockProjet();
    mockPdf();
    renderPage();
    await attendreEditeur();

    await user.click(screen.getByRole("button", { name: "Télécharger le projet" }));

    await waitFor(() => expect(clicDeTelechargement).not.toBeNull());
    expect(clicDeTelechargement?.download).toBe(`projet-attestation-${ID_DEMANDE}.pdf`);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:projet");
  });

  it("désactive les actions PDF tant que des modifications ne sont pas enregistrées, puis les rouvre après enregistrement", async () => {
    const user = userEvent.setup();
    mockProjet();
    server.use(
      http.patch("*/demandes/:id/projet-attestation/", async ({ request }) => {
        const corps = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          contenu_html: corps.contenu_html,
          created_at: "2026-09-18T09:00:00Z",
          updated_at: "2026-09-18T11:00:00Z",
        });
      }),
    );
    renderPage();
    const editeur = await attendreEditeur();

    expect(screen.getByRole("button", { name: "Prévisualiser" })).toBeEnabled();

    await user.click(editeur);
    await user.type(editeur, "Modification.");

    await waitFor(() => expect(screen.getByRole("button", { name: "Prévisualiser" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Télécharger le projet" })).toBeDisabled();
    expect(
      screen.getByText("Modifications non enregistrées. Enregistrez vos modifications avant de générer le PDF."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText("Projet d'attestation enregistré.");

    expect(screen.getByRole("button", { name: "Prévisualiser" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Télécharger le projet" })).toBeEnabled();
  });
});

describe("ProjetAttestationPage — retour", () => {
  it("Retour à la demande navigue vers la consultation", async () => {
    const user = userEvent.setup();
    mockProjet();
    renderPage();
    await screen.findByRole("button", { name: "Retour à la demande" });

    await user.click(screen.getByRole("button", { name: "Retour à la demande" }));

    expect(await screen.findByText("Consultation de la demande (page)")).toBeInTheDocument();
  });
});
