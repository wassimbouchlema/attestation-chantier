import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import type { DemandeDetail, FormulaireRisqueApi } from "../../api/demandes";
import type { EvaluationRisqueApi } from "../../api/evaluationRisque";
import type { PiecesResponseApi } from "../../api/pieces";
import { AuthProvider } from "../../features/auth/AuthProvider";
import { FdrWizardLayout } from "../../features/fdr/components/FdrWizardLayout/FdrWizardLayout";
import { FdrValidationPage } from "../../pages/FdrValidationPage/FdrValidationPage";
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
  statut: "BROUILLON",
  created_at: "2026-09-10T08:00:00Z",
  updated_at: "2026-09-12T10:30:00Z",
  envoye_at: null,
  last_relance_at: null,
  commentaire_distributeur: "",
  fdr: FDR_COMPLET,
  ...overrides,
});

/** Restitue l'état de navigation reçu (message ponctuel) — jamais persisté en base. */
const EtatNavigationStub = ({ titre }: { titre: string }) => {
  const location = useLocation();
  const etat = location.state as { successMessage?: string } | null;
  return (
    <>
      <p>{titre}</p>
      {etat?.successMessage && <p>{etat.successMessage}</p>}
    </>
  );
};

const renderWizard = (chemin = `/distributeur/demandes/${ID_DEMANDE}/validation`) =>
  render(
    <AuthProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[chemin]}>
          <Routes>
            <Route path="/distributeur" element={<EtatNavigationStub titre="Mes demandes (page)" />} />
            <Route path="/distributeur/demandes/:id" element={<FdrWizardLayout />}>
              <Route index element={<p>Retour à la fiche demande (page)</p>} />
              <Route path="informations" element={<p>Informations (page)</p>} />
              <Route path="pieces" element={<p>Pièces & risque (page)</p>} />
              <Route path="validation" element={<FdrValidationPage />} />
            </Route>
            <Route
              path="/distributeur/demandes/:id/consultation"
              element={<EtatNavigationStub titre="Consultation (page)" />}
            />
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

const PIECES_COMPLETES: PiecesResponseApi = {
  pieces: [],
  pieces_requises: [],
  pieces_manquantes: [],
  dossier_complet: true,
};

const PIECES_INCOMPLETES: PiecesResponseApi = {
  pieces: [],
  pieces_requises: ["complexite"],
  pieces_manquantes: ["complexite"],
  dossier_complet: false,
};

const EVALUATION: EvaluationRisqueApi = { score: 10, niveau: "faible", synthese: "Aucun facteur." };

beforeEach(() => {
  seedSession("DISTRIBUTEUR");
});

describe("FdrValidationPage — stepper", () => {
  it("Informations et Pièces & risque sont des liens 'complétés', Validation & envoi est active", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderWizard();
    await screen.findByRole("heading", { name: "Récapitulatif des informations" });

    const lienPieces = screen.getByRole("link", { name: /Pièces & risque/ });
    expect(lienPieces).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Informations/ })).toBeInTheDocument();

    await user.click(lienPieces);
    expect(await screen.findByText("Pièces & risque (page)")).toBeInTheDocument();
  });

  it("rend exactement 3 étapes, l'étape 3 active et jamais représentée comme terminée", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderWizard();
    await screen.findByRole("heading", { name: "Récapitulatif des informations" });

    // Aucun <li> supplémentaire (pas de faux élément de stepper) : exactement
    // les 3 vraies étapes du wizard.
    expect(screen.getAllByRole("listitem")).toHaveLength(3);

    const etapeValidation = screen.getByTitle("Validation & envoi (en cours)");
    expect(etapeValidation).toBeInTheDocument();
    // "en cours" (active) et non "complété" (le stateLabel que Canopée pose
    // sur une étape "terminée"/revisitable) : confirme que l'étape 3 n'est
    // jamais rendue comme terminée tant que l'envoi n'a pas réussi.
    expect(screen.queryByTitle("Validation & envoi (complété)")).not.toBeInTheDocument();
    expect(etapeValidation.className).not.toContain("past");
    // Classe qui neutralise, uniquement pour ce <li>, le style de coche verte
    // que Canopée applique par défaut au dernier <li> d'un Steps (pensé pour
    // une étape terminale de confirmation, inadapté à une étape active).
    expect(etapeValidation.className).toContain("af-steps-list-step--fdr-etape-validation-active");
  });
});

describe("FdrValidationPage — chargement du récapitulatif", () => {
  it("affiche le récapitulatif des informations, les pièces et le risque", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderWizard();

    expect(await screen.findByRole("heading", { name: "Récapitulatif des informations" })).toBeInTheDocument();
    expect(screen.getByText("AXA Construction")).toBeInTheDocument();
    expect(screen.getByText("Tour Horizon")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pièces justificatives" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Évaluation automatique du risque" })).toBeInTheDocument();
    expect(await screen.findByText("Faible")).toBeInTheDocument();
    expect(screen.getByText("10 / 100")).toBeInTheDocument();
    expect(screen.getByText("Aucun facteur.")).toBeInTheDocument();
  });

  it("n'affiche pas les valeurs techniques brutes quand un libellé existe", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderWizard();
    await screen.findByRole("heading", { name: "Récapitulatif des informations" });

    expect(screen.getByText("Construction neuve")).toBeInTheDocument();
    expect(screen.queryByText("NEUVE")).not.toBeInTheDocument();
    expect(screen.getByText("Bureau")).toBeInTheDocument();
    expect(screen.getByText("Entreprise principale")).toBeInTheDocument();
  });
});

describe("FdrValidationPage — pièces justificatives (synthèse de contrôle)", () => {
  it("affiche les catégories et noms des pièces transmises dans un tableau readonly", async () => {
    mockDemande(demandeApi());
    mockPieces({
      ...PIECES_COMPLETES,
      pieces: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          type_piece: "structure",
          nom_fichier_original: "etude-structure.pdf",
          uploaded_at: "2026-09-12T10:30:00Z",
        },
        {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          type_piece: "usage",
          nom_fichier_original: "notice-usage.pdf",
          uploaded_at: "2026-09-12T11:30:00Z",
        },
      ],
    });
    mockEvaluationRisque(EVALUATION);
    renderWizard();

    const tableau = within(await screen.findByRole("table"));
    expect(tableau.getByRole("columnheader", { name: "Catégorie" })).toBeVisible();
    expect(tableau.getByRole("columnheader", { name: "Fichier" })).toBeVisible();
    expect(tableau.getByRole("cell", { name: "etude-structure.pdf" })).toBeVisible();
    expect(tableau.getByRole("cell", { name: "notice-usage.pdf" })).toBeVisible();
    expect(
      within(tableau.getByRole("row", { name: /etude-structure.pdf/ })).getByRole("cell", {
        name: "Justificatif lié à la modification de structure",
      }),
    ).toBeVisible();
    expect(
      within(tableau.getByRole("row", { name: /notice-usage.pdf/ })).getByRole("cell", {
        name: "Justificatif lié à l'usage du chantier",
      }),
    ).toBeVisible();
    expect(tableau.queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
    expect(tableau.queryByRole("button")).not.toBeInTheDocument();
    expect(tableau.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Justificatif/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Supprimer|Prévisualiser|Télécharger/ })).not.toBeInTheDocument();
  });

  it("dossier complet : Tag 'Complet', aucune liste de manquants, aucun bouton de retour", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderWizard();
    await screen.findByRole("heading", { name: "Pièces justificatives" });

    expect(await screen.findByText("Complet")).toBeInTheDocument();
    expect(screen.queryByText("Pièces manquantes")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retour aux pièces justificatives" })).not.toBeInTheDocument();
  });

  it("dossier incomplet : Tag 'Incomplet', catégories manquantes listées, bouton de retour vers l'étape Pièces & risque", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    mockPieces(PIECES_INCOMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderWizard();
    await screen.findByRole("heading", { name: "Pièces justificatives" });

    expect(await screen.findByText("Incomplet")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pièces manquantes" })).toBeInTheDocument();
    expect(screen.getByText("Justificatif lié au caractère atypique du chantier")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retour aux pièces justificatives" }));

    expect(await screen.findByText("Pièces & risque (page)")).toBeInTheDocument();
  });

  it("n'affiche aucun contrôle d'upload ou de suppression de pièce", async () => {
    mockDemande(demandeApi());
    mockPieces(PIECES_INCOMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderWizard();

    await screen.findByText("Incomplet");
    expect(screen.queryByLabelText(/Justificatif/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Supprimer/ })).not.toBeInTheDocument();
  });
});

describe("FdrValidationPage — commentaire", () => {
  it("hydrate le commentaire déjà enregistré", async () => {
    mockDemande(demandeApi({ commentaire_distributeur: "Dossier urgent" }));
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderWizard();

    expect(await screen.findByLabelText("Commentaire (optionnel)")).toHaveValue("Dossier urgent");
  });

  it("Enregistrer le brouillon envoie un PATCH commentaire, reste en BROUILLON, navigue vers /distributeur et affiche un message de succès", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    let corpsRecu: Record<string, unknown> | null = null;
    server.use(
      http.patch("*/demandes/:id/commentaire/", async ({ request }) => {
        corpsRecu = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(corpsRecu);
      }),
    );
    renderWizard();
    await screen.findByLabelText("Commentaire (optionnel)");

    await user.type(screen.getByLabelText("Commentaire (optionnel)"), "Merci de traiter vite");
    await user.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));

    expect(await screen.findByText("Mes demandes (page)")).toBeInTheDocument();
    expect(screen.getByText("Demande enregistrée en brouillon. Vous pourrez la reprendre ultérieurement.")).toBeInTheDocument();
    const corps: Record<string, unknown> = corpsRecu as unknown as Record<string, unknown>;
    expect(corps.commentaire_distributeur).toBe("Merci de traiter vite");
  });

  it("erreur d'enregistrement du brouillon : reste sur la page, message d'erreur affiché", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    server.use(http.patch("*/demandes/:id/commentaire/", () => new HttpResponse(null, { status: 500 })));
    renderWizard();
    await screen.findByLabelText("Commentaire (optionnel)");

    await user.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));

    expect(await screen.findByText("Impossible d'enregistrer le commentaire.")).toBeInTheDocument();
    expect(screen.queryByText("Mes demandes (page)")).not.toBeInTheDocument();
  });
});

describe("FdrValidationPage — Envoyer au siège", () => {
  it(
    "envoie le commentaire courant sans exiger un enregistrement préalable, puis navigue vers la consultation avec un message de succès",
    async () => {
      const user = userEvent.setup();
      mockDemande(demandeApi());
      mockPieces(PIECES_COMPLETES);
      mockEvaluationRisque(EVALUATION);
      let corpsRecu: Record<string, unknown> | null = null;
      server.use(
        http.post("*/demandes/:id/envoyer/", async ({ request }) => {
          corpsRecu = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ...demandeApi(), statut: "EN_COURS", envoye_at: "2026-09-18T10:00:00Z" });
        }),
      );
      renderWizard();
      await screen.findByLabelText("Commentaire (optionnel)");
      await user.type(screen.getByLabelText("Commentaire (optionnel)"), "Commentaire jamais sauvegardé");

      await user.click(screen.getByRole("button", { name: "Envoyer au siège" }));

      expect(await screen.findByText("Consultation (page)")).toBeInTheDocument();
      expect(
        screen.getByText("Demande envoyée au siège. Votre demande est désormais en cours de traitement."),
      ).toBeInTheDocument();
      const corps: Record<string, unknown> = corpsRecu as unknown as Record<string, unknown>;
      expect(corps.commentaire_distributeur).toBe("Commentaire jamais sauvegardé");
    },
    10000,
  );

  it("désactive Enregistrer le brouillon et Envoyer pendant l'envoi", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    server.use(
      http.post("*/demandes/:id/envoyer/", async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ ...demandeApi(), statut: "EN_COURS" });
      }),
    );
    renderWizard();
    await screen.findByRole("button", { name: "Envoyer au siège" });

    await user.click(screen.getByRole("button", { name: "Envoyer au siège" }));

    expect(screen.getByRole("button", { name: "Envoi…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enregistrer le brouillon" })).toBeDisabled();
  });

  it("DOSSIER_INCOMPLET : affiche les catégories manquantes, reste sur la page", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    mockPieces(PIECES_INCOMPLETES);
    mockEvaluationRisque(EVALUATION);
    server.use(
      http.post("*/demandes/:id/envoyer/", () =>
        HttpResponse.json({ code: "DOSSIER_INCOMPLET", pieces_manquantes: ["complexite"] }, { status: 400 }),
      ),
    );
    renderWizard();
    await screen.findByRole("button", { name: "Envoyer au siège" });

    await user.click(screen.getByRole("button", { name: "Envoyer au siège" }));

    // Scopé au message d'erreur d'envoi : le libellé de la catégorie apparaît
    // aussi dans la liste "Pièces manquantes" toujours visible de SyntheseDossierPieces.
    const messageErreurEnvoi = (await screen.findByText("Le dossier documentaire est incomplet.")).closest(
      '[role="alert"]',
    ) as HTMLElement;
    expect(within(messageErreurEnvoi).getByText("Justificatif lié au caractère atypique du chantier")).toBeInTheDocument();
    expect(screen.queryByText("Retour à la fiche demande (page)")).not.toBeInTheDocument();
    expect(screen.queryByText("Consultation (page)")).not.toBeInTheDocument();
  });

  it("FDR_INVALIDE : affiche les erreurs backend, reste sur la page", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    server.use(
      http.post("*/demandes/:id/envoyer/", () =>
        HttpResponse.json(
          { code: "FDR_INVALIDE", erreurs: { assure_nom: "Le nom de l'assuré est obligatoire." } },
          { status: 400 },
        ),
      ),
    );
    renderWizard();
    await screen.findByRole("button", { name: "Envoyer au siège" });

    await user.click(screen.getByRole("button", { name: "Envoyer au siège" }));

    expect(
      await screen.findByText("Certaines informations du formulaire doivent être complétées ou corrigées."),
    ).toBeInTheDocument();
    expect(screen.getByText("Le nom de l'assuré est obligatoire.")).toBeInTheDocument();
    expect(screen.queryByText("Retour à la fiche demande (page)")).not.toBeInTheDocument();
  });

  it("409 : indique que la demande n'est plus modifiable", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    server.use(
      http.post("*/demandes/:id/envoyer/", () =>
        HttpResponse.json({ detail: "Cette demande n'est plus modifiable (statut différent de BROUILLON)." }, { status: 409 }),
      ),
    );
    renderWizard();
    await screen.findByRole("button", { name: "Envoyer au siège" });

    await user.click(screen.getByRole("button", { name: "Envoyer au siège" }));

    expect(
      await screen.findByText("Cette demande n'est plus modifiable (statut différent de BROUILLON)."),
    ).toBeInTheDocument();
  });

  it("erreur technique (500) : message générique", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    mockPieces(PIECES_COMPLETES);
    mockEvaluationRisque(EVALUATION);
    server.use(http.post("*/demandes/:id/envoyer/", () => new HttpResponse(null, { status: 500 })));
    renderWizard();
    await screen.findByRole("button", { name: "Envoyer au siège" });

    await user.click(screen.getByRole("button", { name: "Envoyer au siège" }));

    expect(await screen.findByText("Impossible d'envoyer cette demande au siège.")).toBeInTheDocument();
  });
});

describe("FdrValidationPage — lecture seule (EN_COURS / TRAITE)", () => {
  it("masque les actions Enregistrer le brouillon/Envoyer et le bouton de retour aux pièces", async () => {
    mockDemande(demandeApi({ statut: "EN_COURS" }));
    mockPieces(PIECES_INCOMPLETES);
    mockEvaluationRisque(EVALUATION);
    renderWizard();
    await screen.findByRole("heading", { name: "Récapitulatif des informations" });

    expect(screen.queryByRole("button", { name: "Enregistrer le brouillon" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Envoyer au siège" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retour aux pièces justificatives" })).not.toBeInTheDocument();
  });
});
