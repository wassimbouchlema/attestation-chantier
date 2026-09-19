import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { AttestationApi } from "../../api/attestation";
import type { DemandeDetail } from "../../api/demandes";
import { AuthProvider } from "../../features/auth/AuthProvider";
import { AttestationPage } from "../../pages/AttestationPage/AttestationPage";
import { SiegeDemandeConsultationPage } from "../../pages/SiegeDemandeConsultationPage/SiegeDemandeConsultationPage";
import { createQueryClient } from "../../queryClient";
import { server } from "../server";
import { seedSession } from "../utils";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONTENU = "<p>Chantier déclaré dans le FDR : Tour Horizon.</p>";
const demande: DemandeDetail = {
  id: ID, distributeur: 1, distributeur_nom: "Jean Dupont", statut: "EN_COURS", decision: null,
  created_at: "2026-09-19T09:00:00Z", updated_at: "2026-09-19T09:00:00Z", envoye_at: null,
  last_relance_at: null, commentaire_distributeur: "", attestation_existe: false,
  fdr: {
    assure_nom: "Entreprise FDR", assure_ville: "Paris", assure_numero_contrat: "123456789",
    chantier_nom: "Tour Horizon", chantier_ville: "Lyon", type_chantier: "NEUVE", modification_structure: null,
    chantier_atypique: false, usage: "BUREAU", usage_autre_texte: "", date_debut: "2026-01-10",
    date_fin: "2026-06-30", montant_total: "100000.00", intervention_description: "Rénovation",
    intervention_montant_prestation: "50000.00", intervention_type: "PRINCIPALE", activite_couverte: true,
    activite_non_couverte_texte: "", travaux_standards: true,
  },
};
const documentInitial: AttestationApi = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", demande: ID, contenu_html: CONTENU,
  created_at: "2026-09-19T09:00:00Z", updated_at: "2026-09-19T09:00:00Z", pdf_final: null, validated_at: null,
};

const renderPage = (detail = false) => render(
  <AuthProvider>
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/siege/demandes/${ID}${detail ? "" : "/attestation"}`]}>
        <Routes>
          <Route path="/siege/demandes/:id/attestation" element={<AttestationPage />} />
          <Route path="/siege/demandes/:id" element={<SiegeDemandeConsultationPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  </AuthProvider>,
);

const attendreEditeur = async () => {
  await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).toBeInTheDocument());
  return document.querySelector('[contenteditable="true"]') as HTMLElement;
};

let sauvegarder: Mock<(args: { request: Request }) => Promise<Response>>;
let genererPdf: Mock<() => Response>;
let ouverture: ReturnType<typeof vi.spyOn>;
let fichier: string | undefined;
let contenuEnvoye: string | undefined;

beforeEach(() => {
  seedSession("SIEGE");
  let attestation = { ...documentInitial };
  contenuEnvoye = undefined;
  sauvegarder = vi.fn(async ({ request }: { request: Request }) => {
    const body = await request.json() as { contenu_html: string };
    contenuEnvoye = body.contenu_html;
    attestation = { ...attestation, ...body };
    return HttpResponse.json(attestation);
  });
  genererPdf = vi.fn(() => new HttpResponse("%PDF-1.4 prévisualisation", {
    headers: { "Content-Type": "application/pdf" },
  }));
  server.use(
    http.get("*/siege/demandes/:id/", () => HttpResponse.json(demande)),
    http.get("*/siege/demandes/:id/attestation/", () => HttpResponse.json(attestation)),
    http.patch("*/siege/demandes/:id/attestation/", sauvegarder),
    http.get("*/siege/demandes/:id/attestation/pdf/", genererPdf),
  );
  URL.createObjectURL = vi.fn(() => "blob:attestation");
  URL.revokeObjectURL = vi.fn();
  ouverture = vi.spyOn(window, "open").mockReturnValue(null);
  fichier = undefined;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    fichier = this.download;
  });
});

afterEach(() => vi.restoreAllMocks());

describe("Éditeur SIÈGE", () => {
  it("charge le FDR et le corps, garde la toolbar hors feuille et le gabarit fixe unique", async () => {
    renderPage();
    const editeur = await attendreEditeur();
    expect(editeur).toHaveTextContent("Chantier déclaré dans le FDR : Tour Horizon.");
    const feuille = screen.getByRole("article");
    const toolbar = screen.getByLabelText("Mise en forme du texte");
    expect(feuille.contains(toolbar)).toBe(false);
    expect(feuille.contains(editeur)).toBe(true);
    expect(within(feuille).getByAltText("AXA")).toBeInTheDocument();
    for (const texte of ["Attestation d'assurance", "Jean Dupont", "Entreprise FDR", "Contrat n° 123456789"]) {
      const element = within(feuille).getByText(texte);
      expect(editeur.contains(element)).toBe(false);
    }
    expect(within(feuille).queryByText("Préparation d'attestation")).not.toBeInTheDocument();
    expect(within(feuille).queryByText("Non validée")).not.toBeInTheDocument();
    expect(within(feuille).queryByText("Validation définitive : réservée au siège.")).not.toBeInTheDocument();
    expect(within(feuille).queryByText("Alice Martin")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Valider|Accepter|Contrôler/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Enregistrez vos modifications/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prévisualiser" })).toBeEnabled();
    expect(genererPdf).not.toHaveBeenCalled();
    expect(sauvegarder).not.toHaveBeenCalled();
  });

  it("modifie, bloque les PDF sans autosave, enregistre puis prévisualise et télécharge", async () => {
    const user = userEvent.setup();
    renderPage();
    const editeur = await attendreEditeur();
    await user.type(editeur, "Ajout siège.");
    expect(screen.getByText("Enregistrez vos modifications avant de générer la prévisualisation.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prévisualiser" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Télécharger la prévisualisation" })).toBeDisabled();
    expect(sauvegarder).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Prévisualiser" }));
    expect(genererPdf).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText("Attestation enregistrée.");
    expect(sauvegarder).toHaveBeenCalledTimes(1);
    expect(contenuEnvoye).toContain("Ajout siège.");
    expect(await attendreEditeur()).toHaveTextContent("Ajout siège.");
    expect(screen.queryByText(/Enregistrez vos modifications/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prévisualiser" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Télécharger la prévisualisation" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Prévisualiser" }));
    await waitFor(() => expect(ouverture).toHaveBeenCalledWith("blob:attestation", "_blank"));
    await user.click(screen.getByRole("button", { name: "Télécharger la prévisualisation" }));
    await waitFor(() => expect(fichier).toBe(`preparation-attestation-${ID}.pdf`));
    expect(genererPdf).toHaveBeenCalledTimes(2);
  });

  it("conserve dirty et le texte après échec PATCH", async () => {
    server.use(http.patch("*/siege/demandes/:id/attestation/", () => new HttpResponse(null, { status: 500 })));
    const user = userEvent.setup();
    renderPage();
    await user.type(await attendreEditeur(), "À conserver.");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText("Impossible d'enregistrer l'attestation.");
    expect(await attendreEditeur()).toHaveTextContent("À conserver.");
    expect(screen.getByRole("button", { name: "Prévisualiser" })).toBeDisabled();
  });

  it("revient au détail de la demande", async () => {
    const user = userEvent.setup();
    renderPage();
    await attendreEditeur();
    await user.click(screen.getByRole("button", { name: "Retour à la demande" }));
    expect(await screen.findByRole("heading", { name: "Traitement de la demande" })).toBeInTheDocument();
  });

  it("signale un document absent et permet le retour", async () => {
    server.use(http.get("*/siege/demandes/:id/attestation/", () => new HttpResponse(null, { status: 404 })));
    renderPage();
    expect(await screen.findByText("Cette attestation est introuvable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retour à la demande" })).toBeEnabled();
  });
});

describe("Préparation depuis le détail SIÈGE", () => {
  it("prépare puis ouvre l'éditeur même avec un complément actif", async () => {
    const preparer = vi.fn(() => HttpResponse.json(documentInitial, { status: 201 }));
    server.use(
      http.get("*/siege/demandes/:id/", () => HttpResponse.json({ ...demande, complement_actif: {
        id: "complement", message: "Précisions attendues", requested_at: "2026-09-19T09:00:00Z", received_at: null,
      } })),
      http.post("*/siege/demandes/:id/attestation/preparer/", preparer),
    );
    const user = userEvent.setup();
    renderPage(true);
    await user.click(await screen.findByRole("button", { name: "Préparer l'attestation" }));
    expect(await attendreEditeur()).toHaveTextContent("Tour Horizon");
    expect(preparer).toHaveBeenCalledTimes(1);
  });

  it("reprend une attestation existante sans nouvelle préparation", async () => {
    const preparer = vi.fn();
    server.use(
      http.get("*/siege/demandes/:id/", () => HttpResponse.json({ ...demande, attestation_existe: true })),
      http.post("*/siege/demandes/:id/attestation/preparer/", preparer),
    );
    const user = userEvent.setup();
    renderPage(true);
    await user.click(await screen.findByRole("button", { name: "Reprendre l'attestation" }));
    expect(await attendreEditeur()).toHaveTextContent("Tour Horizon");
    expect(preparer).not.toHaveBeenCalled();
  });

  it("masque la préparation d'une demande refusée ou traitée", async () => {
    server.use(http.get("*/siege/demandes/:id/", () => HttpResponse.json({
      ...demande, statut: "TRAITE", decision: "REFUSEE",
    })));
    renderPage(true);
    await screen.findByRole("heading", { name: "Traitement de la demande" });
    expect(screen.queryByRole("button", { name: /Préparer|Reprendre/ })).not.toBeInTheDocument();
  });
});
