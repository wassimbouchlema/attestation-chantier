import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { AttestationApi, ResultatCoherenceApi } from "../../api/attestation";
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
    assure_nom: "Entreprise FDR", assure_ville: "Paris", assure_numero_contrat: "1234567890123",
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

const AccueilSiegeStub = () => {
  const etat = useLocation().state as { successMessage?: string } | null;
  return <p>Accueil SIÈGE (page) {etat?.successMessage}</p>;
};

const renderPage = (detail = false) => render(
  <AuthProvider>
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/siege/demandes/${ID}${detail ? "" : "/attestation"}`]}>
        <Routes>
          <Route path="/siege/demandes/:id/attestation" element={<AttestationPage />} />
          <Route path="/siege" element={<AccueilSiegeStub />} />
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
let analyser: Mock<() => Response>;
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
  analyser = vi.fn(() => HttpResponse.json({
    coherent: true,
    resume: "Aucune incohérence détectée entre le FDR et l'attestation enregistrée.", anomalies: [],
  } satisfies ResultatCoherenceApi));
  server.use(
    http.get("*/siege/demandes/:id/", () => HttpResponse.json(demande)),
    http.get("*/siege/demandes/:id/attestation/", () => HttpResponse.json(attestation)),
    http.patch("*/siege/demandes/:id/attestation/", sauvegarder),
    http.get("*/siege/demandes/:id/attestation/pdf/", genererPdf),
    http.post("*/siege/demandes/:id/attestation/analyser-coherence/", analyser),
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
    for (const texte of ["Attestation d'assurance", "Jean Dupont", "Entreprise FDR", "Contrat n° 1234567890123"]) {
      const element = within(feuille).getByText(texte);
      expect(editeur.contains(element)).toBe(false);
    }
    expect(within(feuille).queryByText("Préparation d'attestation")).not.toBeInTheDocument();
    expect(within(feuille).queryByText("Non validée")).not.toBeInTheDocument();
    expect(within(feuille).queryByText("Validation définitive : réservée au siège.")).not.toBeInTheDocument();
    expect(within(feuille).queryByText("Alice Martin")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accepter|Refuser/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyser la cohérence" })).toBeEnabled();
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
    expect(screen.getByRole("button", { name: "Analyser la cohérence" })).toBeDisabled();
    expect(screen.getByText("Enregistrez vos modifications avant de lancer le contrôle.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Analyser la cohérence" }));
    expect(analyser).not.toHaveBeenCalled();
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
    expect(screen.getByRole("button", { name: "Analyser la cohérence" })).toBeEnabled();
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
    expect(screen.getByRole("button", { name: "Analyser la cohérence" })).toBeDisabled();
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

describe("Contrôle de cohérence SIÈGE", () => {
  it("affiche le chargement puis le résultat cohérent sans action de décision", async () => {
    server.use(http.post("*/siege/demandes/:id/attestation/analyser-coherence/", async ({ request }) => {
      expect(await request.text()).toBe("");
      await delay(150);
      return analyser();
    }));
    const user = userEvent.setup();
    renderPage();
    await attendreEditeur();
    await user.click(screen.getByRole("button", { name: "Analyser la cohérence" }));
    expect(screen.getByRole("button", { name: "Analyse en cours…" })).toBeDisabled();
    expect(await screen.findByText("Cohérent")).toBeInTheDocument();
    expect(screen.getByText("Aucune incohérence détectée entre le FDR et l'attestation enregistrée.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accepter|Refuser/ })).not.toBeInTheDocument();
    expect(sauvegarder).not.toHaveBeenCalled();
    expect(analyser).toHaveBeenCalledTimes(1);
  });

  it("restitue les anomalies du contrôle de cohérence", async () => {
    analyser.mockImplementation(() => HttpResponse.json({
      coherent: false, resume: "Deux écarts factuels détectés.",
      anomalies: [
        { type: "VALEUR_DIFFERENTE", champ: "montant_total", valeur_fdr: "12000000.00",
          valeur_attestation: "1200000.00", message: "Le montant total diffère." },
        { type: "INFORMATION_ABSENTE", champ: "date_fin", valeur_fdr: "2027-06-30",
          valeur_attestation: "", message: "La date de fin est absente." },
      ],
    } satisfies ResultatCoherenceApi));
    const user = userEvent.setup();
    renderPage();
    await attendreEditeur();
    await user.click(screen.getByRole("button", { name: "Analyser la cohérence" }));
    expect(await screen.findByText("Incohérences détectées")).toBeInTheDocument();
    const resultat = screen.getByRole("region", { name: "Résultat du contrôle de cohérence" });
    for (const texte of ["Montant total du chantier", "12 000 000,00 €", "1 200 000,00 €",
      "Le montant total diffère.", "Date de fin", "2027-06-30", "Information absente", "La date de fin est absente."]) {
      expect(within(resultat).getByText(texte)).toBeInTheDocument();
    }
    expect(within(resultat).getAllByText("Valeur FDR")).toHaveLength(2);
    expect(within(resultat).getAllByText("Valeur attestation")).toHaveLength(2);
  });

  it("affiche l'erreur du contrôle de cohérence sans ancien résultat puis autorise une nouvelle tentative", async () => {
    const user = userEvent.setup();
    renderPage();
    await attendreEditeur();
    await user.click(screen.getByRole("button", { name: "Analyser la cohérence" }));
    await screen.findByText("Cohérent");
    analyser.mockImplementationOnce(() => HttpResponse.json({
      code: "IA_INDISPONIBLE", detail: "Le contrôle de cohérence est indisponible. Réessayez plus tard.",
    }, { status: 503 }));
    await user.click(screen.getByRole("button", { name: "Analyser la cohérence" }));
    expect(await screen.findByText("Le contrôle de cohérence est indisponible. Réessayez plus tard.")).toBeInTheDocument();
    expect(screen.queryByText("Cohérent")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Analyser la cohérence" }));
    expect(await screen.findByText("Cohérent")).toBeInTheDocument();
    expect(analyser).toHaveBeenCalledTimes(3);
  });

  it("supprime le résultat dès modification puis analyse la version enregistrée", async () => {
    const user = userEvent.setup();
    renderPage();
    const editeur = await attendreEditeur();
    await user.click(screen.getByRole("button", { name: "Analyser la cohérence" }));
    await screen.findByText("Cohérent");
    await user.type(editeur, "Correction.");
    expect(screen.queryByText("Cohérent")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyser la cohérence" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText("Attestation enregistrée.");
    expect(screen.queryByText("Cohérent")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Analyser la cohérence" }));
    expect(await screen.findByText("Cohérent")).toBeInTheDocument();
    expect(analyser).toHaveBeenCalledTimes(2);
  });

  it("ignore une réponse arrivée après modification et sauvegarde pendant l'analyse", async () => {
    let terminer!: () => void;
    const attente = new Promise<void>((resolve) => { terminer = resolve; });
    server.use(http.post("*/siege/demandes/:id/attestation/analyser-coherence/", async () => {
      await attente;
      return analyser();
    }));
    const user = userEvent.setup();
    renderPage();
    const editeur = await attendreEditeur();
    await user.click(screen.getByRole("button", { name: "Analyser la cohérence" }));
    await user.type(editeur, "Nouvelle version.");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText("Attestation enregistrée.");
    terminer();
    await waitFor(() => expect(screen.getByRole("button", { name: "Analyser la cohérence" })).toBeEnabled());
    expect(screen.queryByText("Cohérent")).not.toBeInTheDocument();
    expect(analyser).toHaveBeenCalledTimes(1);
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
    await user.click(await screen.findByRole("button", { name: "Modifier l'attestation" }));
    expect(await attendreEditeur()).toHaveTextContent("Tour Horizon");
    expect(preparer).not.toHaveBeenCalled();
  });

  it("masque la préparation d'une demande refusée ou traitée", async () => {
    server.use(http.get("*/siege/demandes/:id/", () => HttpResponse.json({
      ...demande, statut: "TRAITE", decision: "REFUSEE",
    })));
    renderPage(true);
    await screen.findByRole("heading", { name: "Traitement de la demande" });
    expect(screen.queryByRole("button", { name: /Préparer|Modifier/ })).not.toBeInTheDocument();
  });
});

describe("Validation et acceptation SIÈGE", () => {
  const demandeTraitee: DemandeDetail = { ...demande, statut: "TRAITE", decision: "ACCEPTEE" };

  it("désactive la validation tant que le contenu n'est pas enregistré, sans exiger le contrôle de cohérence", async () => {
    const user = userEvent.setup();
    renderPage();
    const editeur = await attendreEditeur();
    expect(screen.getByRole("button", { name: "Valider et accepter" })).toBeEnabled();
    await user.type(editeur, "Ajout siège.");
    expect(screen.getByRole("button", { name: "Valider et accepter" })).toBeDisabled();
    expect(screen.getByText("Enregistrez vos modifications avant de valider l'attestation.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText("Attestation enregistrée.");
    expect(screen.getByRole("button", { name: "Valider et accepter" })).toBeEnabled();
    expect(analyser).not.toHaveBeenCalled();
  });

  it("demande confirmation, valide une seule fois et retourne à l'accueil SIÈGE", async () => {
    const valider = vi.fn(async () => {
      await delay(50);
      return HttpResponse.json(demandeTraitee);
    });
    server.use(http.post("*/siege/demandes/:id/attestation/valider/", valider));
    const user = userEvent.setup();
    renderPage();
    await attendreEditeur();
    await user.click(screen.getByRole("button", { name: "Valider et accepter" }));
    const dialogue = await screen.findByRole("dialog", { name: /Valider et accepter cette demande/ });
    expect(within(dialogue).getByText(/L'attestation ne pourra plus être modifiée après validation./)).toBeInTheDocument();
    await user.click(within(dialogue).getByRole("button", { name: "Annuler" }));
    expect(valider).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Valider et accepter" }));
    const confirmer = within(await screen.findByRole("dialog")).getByRole("button", { name: "Valider et accepter" });
    await user.dblClick(confirmer);
    expect(await screen.findByText(/Accueil SIÈGE \(page\)/)).toHaveTextContent(
      "Demande acceptée et attestation définitive générée.",
    );
    expect(valider).toHaveBeenCalledTimes(1);
  });

  it("affiche l'erreur backend et reste sur la page", async () => {
    server.use(http.post("*/siege/demandes/:id/attestation/valider/", () => HttpResponse.json(
      { code: "ATTESTATION_DEJA_VALIDEE", detail: "Cette attestation est déjà validée." }, { status: 409 },
    )));
    const user = userEvent.setup();
    renderPage();
    await attendreEditeur();
    await user.click(screen.getByRole("button", { name: "Valider et accepter" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Valider et accepter" }));
    expect(await screen.findByText("Cette attestation est déjà validée.")).toBeInTheDocument();
    expect(screen.queryByText(/Accueil SIÈGE/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Contrôle de cohérence" })).toBeInTheDocument();
  });
});

describe("Parcours d'actions SIÈGE", () => {
  it("actions documentaires sous l'éditeur, contrôle de cohérence, puis zone de décision finale", async () => {
    renderPage();
    await attendreEditeur();

    const enregistrer = screen.getByRole("button", { name: "Enregistrer" });
    const groupeDoc = enregistrer.parentElement as HTMLElement;
    expect(within(groupeDoc).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Enregistrer",
      "Prévisualiser",
      "Télécharger la prévisualisation",
    ]);

    const analyser = screen.getByRole("button", { name: "Analyser la cohérence" });
    const titre = screen.getByRole("heading", { name: "Contrôle de cohérence" });
    expect(titre.closest(".surface")).toContainElement(analyser);

    const valider = screen.getByRole("button", { name: "Valider et accepter" });
    const retour = screen.getByRole("button", { name: "Retour à la demande" });
    const decision = valider.parentElement as HTMLElement;
    expect(within(decision).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Retour à la demande",
      "Valider et accepter",
    ]);
    expect(decision).toContainElement(retour);
    expect(groupeDoc.compareDocumentPosition(titre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(titre.compareDocumentPosition(valider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Valider et accepter reste disponible sans contrôle de cohérence", async () => {
    renderPage();
    await attendreEditeur();
    expect(screen.getByRole("button", { name: "Valider et accepter" })).toBeEnabled();
    expect(screen.queryByRole("region", { name: "Résultat du contrôle de cohérence" })).not.toBeInTheDocument();
  });
});
