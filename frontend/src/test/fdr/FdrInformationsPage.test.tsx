import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { HttpResponse, http } from "msw";
import { Link, MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import type { Demande, DemandeDetail, FormulaireRisqueApi } from "../../api/demandes";
import { FdrWizardLayout } from "../../features/fdr/components/FdrWizardLayout/FdrWizardLayout";
import { AuthProvider } from "../../features/auth/AuthProvider";
import { FdrInformationsPage } from "../../pages/FdrInformations/FdrInformationsPage";
import { createQueryClient } from "../../queryClient";
import { server } from "../server";
import { seedSession } from "../utils";

const ID_DEMANDE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TITRES_SECTIONS = ["Assuré", "Chantier", "Usage & calendrier", "Intervention", "Questions métier"];

const renderWizard = (chemin = `/distributeur/demandes/${ID_DEMANDE}/informations`) =>
  render(
    <AuthProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[chemin]}>
          <Routes>
            <Route path="/distributeur" element={<p>Mes demandes (liste)</p>} />
            <Route path="/distributeur/demandes/:id" element={<FdrWizardLayout />}>
              <Route index element={<Navigate to="informations" replace />} />
              <Route path="informations" element={<FdrInformationsPage />} />
              <Route
                path="pieces"
                element={
                  <>
                    <p>Pièces & risque (page)</p>
                    <Link to={`/distributeur/demandes/${ID_DEMANDE}/informations`}>Retour aux informations (test)</Link>
                  </>
                }
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthProvider>,
  );

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

// Villes volontairement distinctes d'assure_ville/chantier_ville : la restitution affiche
// désormais chaque champ dans une ligne Restitution séparée, deux mêmes valeurs textuelles
// rendraient les recherches par texte ambiguës.
const FDR_COMPLET: FormulaireRisqueApi = {
  assure_nom: "AXA Construction",
  assure_ville: "Paris",
  assure_numero_contrat: "123456789",
  chantier_nom: "Tour Horizon",
  chantier_ville: "Lyon",
  type_chantier: "RENOVATION",
  modification_structure: true,
  chantier_atypique: false,
  usage: "BUREAU",
  usage_autre_texte: "",
  date_debut: "2026-01-10",
  date_fin: "2026-06-30",
  montant_total: "500000.00",
  intervention_description: "Rénovation complète des bureaux",
  intervention_montant_prestation: "120000.00",
  intervention_type: "PRINCIPALE",
  activite_couverte: true,
  activite_non_couverte_texte: "",
  travaux_standards: true,
};

// FDR_COMPLET privé uniquement des 2 champs obligatoires de Questions métier :
// seule cette dernière section doit apparaître incomplète à l'hydratation.
const FDR_QUESTIONS_METIER_INCOMPLETES: FormulaireRisqueApi = {
  ...FDR_COMPLET,
  activite_couverte: null,
  travaux_standards: null,
};

const demandeApi = (overrides: Partial<Demande> = {}, fdr: FormulaireRisqueApi = FDR_VIDE): DemandeDetail => ({
  id: ID_DEMANDE,
  distributeur: 1,
  statut: "BROUILLON",
  created_at: "2026-09-10T08:00:00Z",
  updated_at: "2026-09-12T10:30:00Z",
  envoye_at: null,
  last_relance_at: null,
  commentaire_distributeur: "",
  fdr,
  ...overrides,
});

const mockDemande = (demande: DemandeDetail) => {
  server.use(http.get("*/demandes/:id/", () => HttpResponse.json(demande)));
};

beforeEach(() => {
  seedSession("DISTRIBUTEUR");
});

describe("FdrInformationsPage — chargement", () => {
  it("affiche un état de chargement puis hydrate les champs déjà saisis depuis le FDR existant", async () => {
    // Assuré volontairement incomplet (ville/numéro de contrat manquants) : la section
    // reste "active" à l'hydratation (cf. describe "reprise d'un brouillon" plus bas
    // pour le cas d'un FDR complet, où elle apparaîtrait en restitution "validée").
    mockDemande(demandeApi({}, { ...FDR_VIDE, assure_nom: "AXA Construction" }));
    renderWizard();

    expect(screen.getByText(/Chargement en cours/)).toBeInTheDocument();
    expect(await screen.findByLabelText("Nom / raison sociale")).toHaveValue("AXA Construction");
    expect(screen.getByLabelText("Ville")).toHaveValue("");
    expect(screen.getByLabelText("Numéro de contrat")).toHaveValue("");
  });

  it("affiche un message explicite quand la demande est introuvable (404)", async () => {
    server.use(http.get("*/demandes/:id/", () => new HttpResponse(null, { status: 404 })));
    renderWizard();

    const message = await screen.findByText("Cette demande est introuvable.");
    expect(message.closest('[role="alert"]')).not.toBeNull();
  });

  it("affiche une erreur réseau/serveur générique en cas d'échec 500", async () => {
    server.use(http.get("*/demandes/:id/", () => new HttpResponse(null, { status: 500 })));
    renderWizard();

    const message = await screen.findByText("Impossible de récupérer cette demande.");
    expect(message.closest('[role="alert"]')).not.toBeNull();
  });
});

describe("FdrInformationsPage — stepper", () => {
  it("affiche Informations active et les étapes 2/3 non navigables (aucun lien)", async () => {
    mockDemande(demandeApi());
    renderWizard();
    await screen.findByLabelText("Nom / raison sociale");

    expect(screen.getByText("Informations")).toBeInTheDocument();
    expect(screen.getByText("Pièces & risque")).toBeInTheDocument();
    expect(screen.getByText("Validation & envoi")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Pièces & risque/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Validation & envoi/ })).not.toBeInTheDocument();
  });
});

describe("FdrInformationsPage — les 5 sections visibles dès l'ouverture (BROUILLON)", () => {
  it("affiche les 5 en-têtes de section dès le chargement", async () => {
    mockDemande(demandeApi());
    renderWizard();
    await screen.findByLabelText("Nom / raison sociale");

    for (const titre of TITRES_SECTIONS) {
      expect(screen.getByRole("heading", { name: titre })).toBeInTheDocument();
    }
  });

  it("Assuré est actif initialement ; les autres sections sont visibles mais sans aucun champ ni interaction", async () => {
    mockDemande(demandeApi());
    renderWizard();
    await screen.findByLabelText("Nom / raison sociale");

    expect(screen.getByRole("heading", { name: "Chantier" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Nom du chantier")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier l'étape Chantier" })).not.toBeInTheDocument();
  });

  it("le bouton de validation d'une section s'appelle Valider, plus Continuer", async () => {
    mockDemande(demandeApi());
    renderWizard();
    await screen.findByLabelText("Nom / raison sociale");

    expect(screen.getByRole("button", { name: "Valider" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuer" })).not.toBeInTheDocument();
  });
});

describe("FdrInformationsPage — section Assuré (BROUILLON)", () => {
  it("Valider avec des champs invalides affiche les erreurs et garde la section active", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    renderWizard();
    await screen.findByLabelText("Nom / raison sociale");

    await user.click(screen.getByRole("button", { name: "Valider" }));

    expect(await screen.findByText("Le nom de l'assuré est obligatoire.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nom / raison sociale")).toBeInTheDocument();
  });

  it("rejette un numéro de contrat non numérique ou trop long", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    renderWizard();
    await screen.findByLabelText("Nom / raison sociale");

    await user.type(screen.getByLabelText("Numéro de contrat"), "12AB");
    await user.click(screen.getByRole("button", { name: "Valider" }));

    expect(
      await screen.findByText("Le numéro de contrat doit être uniquement numérique (13 chiffres maximum)."),
    ).toBeInTheDocument();
  });

  it("Valider avec des champs valides bascule en restitution et active la section suivante, sans requête PATCH, les autres sections restant visibles", async () => {
    // server.listen({ onUnhandledRequest: "error" }) (test/setup.ts) : aucun handler PATCH
    // n'est enregistré pour /fdr/ dans ce fichier — une tentative de PATCH ferait échouer le test.
    const user = userEvent.setup();
    mockDemande(demandeApi());
    renderWizard();
    await screen.findByLabelText("Nom / raison sociale");

    await user.type(screen.getByLabelText("Nom / raison sociale"), "AXA Construction");
    await user.type(screen.getByLabelText("Ville"), "Paris");
    await user.type(screen.getByLabelText("Numéro de contrat"), "123456789");
    await user.click(screen.getByRole("button", { name: "Valider" }));

    expect(await screen.findByText("AXA Construction")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nom / raison sociale")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nom du chantier")).toBeInTheDocument();
    for (const titre of ["Usage & calendrier", "Intervention", "Questions métier"]) {
      expect(screen.getByRole("heading", { name: titre })).toBeInTheDocument();
    }
  });

  it("Modifier rouvre la section validée avec ses valeurs conservées", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    renderWizard();
    await screen.findByLabelText("Nom / raison sociale");

    await user.type(screen.getByLabelText("Nom / raison sociale"), "AXA Construction");
    await user.type(screen.getByLabelText("Ville"), "Paris");
    await user.type(screen.getByLabelText("Numéro de contrat"), "123456789");
    await user.click(screen.getByRole("button", { name: "Valider" }));
    await screen.findByText("AXA Construction");

    await user.click(screen.getByRole("button", { name: "Modifier l'étape Assuré" }));

    expect(screen.getByLabelText("Nom / raison sociale")).toHaveValue("AXA Construction");
    expect(screen.getByLabelText("Ville")).toHaveValue("Paris");
  });
});

describe("FdrInformationsPage — champs conditionnels", () => {
  const avancerJusquaChantier = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText("Nom / raison sociale"), "AXA Construction");
    await user.type(screen.getByLabelText("Ville"), "Paris");
    await user.type(screen.getByLabelText("Numéro de contrat"), "123456789");
    await user.click(screen.getByRole("button", { name: "Valider" }));
    await screen.findByLabelText("Nom du chantier");
  };

  it("affiche modification_structure uniquement pour un chantier de type Rénovation, et le nettoie si le type change", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    renderWizard();
    await screen.findByLabelText("Nom / raison sociale");
    await avancerJusquaChantier(user);

    expect(screen.queryByText("Modification de structure ?")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Type de chantier"), "Rénovation");
    expect(screen.getByText("Modification de structure ?")).toBeInTheDocument();

    const radioGroup = screen.getByRole("radiogroup", { name: "Modification de structure ?" });
    await user.click(within(radioGroup).getByLabelText("Oui"));
    expect(within(radioGroup).getByLabelText("Oui")).toBeChecked();

    await user.selectOptions(screen.getByLabelText("Type de chantier"), "Construction neuve");
    expect(screen.queryByText("Modification de structure ?")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Type de chantier"), "Rénovation");
    const radioGroupApresRetour = screen.getByRole("radiogroup", { name: "Modification de structure ?" });
    expect(within(radioGroupApresRetour).getByLabelText("Oui")).not.toBeChecked();
    expect(within(radioGroupApresRetour).getByLabelText("Non")).not.toBeChecked();
  });

  it("chantier_atypique est tri-state : aucune option n'est cochée par défaut (null distinct de false)", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    renderWizard();
    await screen.findByLabelText("Nom / raison sociale");
    await avancerJusquaChantier(user);

    const radioGroup = screen.getByRole("radiogroup", { name: "Chantier atypique ?" });
    expect(within(radioGroup).getByLabelText("Oui")).not.toBeChecked();
    expect(within(radioGroup).getByLabelText("Non")).not.toBeChecked();
  });

  it("chantier_atypique et modification_structure (en rénovation) sont obligatoires pour valider", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    renderWizard();
    await screen.findByLabelText("Nom / raison sociale");
    await avancerJusquaChantier(user);

    await user.type(screen.getByLabelText("Nom du chantier"), "Tour Horizon");
    await user.type(screen.getByLabelText("Ville"), "Paris");
    await user.selectOptions(screen.getByLabelText("Type de chantier"), "Rénovation");
    await user.click(screen.getByRole("button", { name: "Valider" }));

    expect(
      await screen.findByText("Merci d'indiquer si le chantier implique une modification de structure."),
    ).toBeInTheDocument();
    expect(screen.getByText("Merci d'indiquer si le chantier est atypique.")).toBeInTheDocument();
  });
});

describe("FdrInformationsPage — sections Usage/Intervention/Questions métier", () => {
  const avancerJusquaUsage = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText("Nom / raison sociale"), "AXA Construction");
    await user.type(screen.getByLabelText("Ville"), "Paris");
    await user.type(screen.getByLabelText("Numéro de contrat"), "123456789");
    await user.click(screen.getByRole("button", { name: "Valider" }));
    await screen.findByLabelText("Nom du chantier");

    await user.type(screen.getByLabelText("Nom du chantier"), "Tour Horizon");
    await user.type(screen.getByLabelText("Ville"), "Lyon");
    await user.selectOptions(screen.getByLabelText("Type de chantier"), "Construction neuve");
    await user.click(within(screen.getByRole("radiogroup", { name: "Chantier atypique ?" })).getByLabelText("Non"));
    await user.click(screen.getByRole("button", { name: "Valider" }));
    await screen.findByLabelText("Usage");
  };

  const avancerJusquaIntervention = async (user: ReturnType<typeof userEvent.setup>) => {
    await avancerJusquaUsage(user);
    await user.selectOptions(screen.getByLabelText("Usage"), "Bureau");
    fireEvent.change(screen.getByLabelText("Date de début"), { target: { value: "2026-01-10" } });
    fireEvent.change(screen.getByLabelText("Date de fin"), { target: { value: "2026-06-30" } });
    await user.type(screen.getByLabelText("Montant total (€)"), "500000");
    await user.click(screen.getByRole("button", { name: "Valider" }));
    await screen.findByLabelText("Description des travaux");
  };

  const avancerJusquaQuestionsMetier = async (user: ReturnType<typeof userEvent.setup>) => {
    await avancerJusquaIntervention(user);
    await user.type(screen.getByLabelText("Description des travaux"), "Rénovation complète");
    await user.type(screen.getByLabelText("Montant de la prestation (€)"), "120000");
    await user.selectOptions(screen.getByLabelText("Type d'intervention"), "Entreprise principale");
    await user.click(screen.getByRole("button", { name: "Valider" }));
    await screen.findByText("L'activité est-elle couverte par le contrat ?");
  };

  it("affiche la précision d'usage uniquement quand Usage = Autre", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    renderWizard();
    await screen.findByLabelText("Nom / raison sociale");
    await avancerJusquaUsage(user);

    expect(screen.queryByLabelText("Précision de l'usage")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Usage"), "Autre");
    expect(screen.getByLabelText("Précision de l'usage")).toBeInTheDocument();
  });

  it("rejette une date de fin antérieure ou égale à la date de début", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    renderWizard();
    await screen.findByLabelText("Nom / raison sociale");
    await avancerJusquaUsage(user);

    await user.selectOptions(screen.getByLabelText("Usage"), "Bureau");
    fireEvent.change(screen.getByLabelText("Date de début"), { target: { value: "2026-06-30" } });
    fireEvent.change(screen.getByLabelText("Date de fin"), { target: { value: "2026-01-10" } });
    await user.type(screen.getByLabelText("Montant total (€)"), "1000");
    await user.click(screen.getByRole("button", { name: "Valider" }));

    expect(
      await screen.findByText("La date de fin doit être strictement postérieure à la date de début."),
    ).toBeInTheDocument();
  });

  it("rejette un montant de prestation supérieur ou égal au montant total", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    renderWizard();
    await screen.findByLabelText("Nom / raison sociale");
    await avancerJusquaIntervention(user);

    await user.type(screen.getByLabelText("Description des travaux"), "Rénovation complète");
    await user.type(screen.getByLabelText("Montant de la prestation (€)"), "500000");
    await user.selectOptions(screen.getByLabelText("Type d'intervention"), "Entreprise principale");
    await user.click(screen.getByRole("button", { name: "Valider" }));

    expect(
      await screen.findByText("Le montant de la prestation doit être strictement inférieur au montant total."),
    ).toBeInTheDocument();
  });

  it(
    "affiche l'explication uniquement quand l'activité n'est pas couverte, et l'exige pour valider",
    async () => {
      const user = userEvent.setup();
      mockDemande(demandeApi());
      renderWizard();
      await screen.findByLabelText("Nom / raison sociale");
      await avancerJusquaQuestionsMetier(user);

      expect(screen.queryByLabelText("Explication")).not.toBeInTheDocument();

      const radioActivite = screen.getByRole("radiogroup", { name: "L'activité est-elle couverte par le contrat ?" });
      await user.click(within(radioActivite).getByLabelText("Non"));
      expect(screen.getByLabelText("Explication")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Valider" }));
      expect(
        await screen.findByText("Une explication est nécessaire lorsque l'activité n'est pas couverte par le contrat."),
      ).toBeInTheDocument();
    },
    15000,
  );
});

const remplirLes5Sections = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText("Nom / raison sociale"), "AXA Construction");
  await user.type(screen.getByLabelText("Ville"), "Paris");
  await user.type(screen.getByLabelText("Numéro de contrat"), "123456789");
  await user.click(screen.getByRole("button", { name: "Valider" }));
  await screen.findByLabelText("Nom du chantier");

  await user.type(screen.getByLabelText("Nom du chantier"), "Tour Horizon");
  await user.type(screen.getByLabelText("Ville"), "Lyon");
  await user.selectOptions(screen.getByLabelText("Type de chantier"), "Construction neuve");
  await user.click(within(screen.getByRole("radiogroup", { name: "Chantier atypique ?" })).getByLabelText("Non"));
  await user.click(screen.getByRole("button", { name: "Valider" }));
  await screen.findByLabelText("Usage");

  await user.selectOptions(screen.getByLabelText("Usage"), "Bureau");
  fireEvent.change(screen.getByLabelText("Date de début"), { target: { value: "2026-01-10" } });
  fireEvent.change(screen.getByLabelText("Date de fin"), { target: { value: "2026-06-30" } });
  await user.type(screen.getByLabelText("Montant total (€)"), "500000");
  await user.click(screen.getByRole("button", { name: "Valider" }));
  await screen.findByLabelText("Description des travaux");

  await user.type(screen.getByLabelText("Description des travaux"), "Rénovation complète");
  await user.type(screen.getByLabelText("Montant de la prestation (€)"), "120000");
  await user.selectOptions(screen.getByLabelText("Type d'intervention"), "Entreprise principale");
  await user.click(screen.getByRole("button", { name: "Valider" }));
  await screen.findByText("L'activité est-elle couverte par le contrat ?");

  await user.click(within(screen.getByRole("radiogroup", { name: "L'activité est-elle couverte par le contrat ?" })).getByLabelText("Oui"));
  await user.click(within(screen.getByRole("radiogroup", { name: "Les travaux sont-ils standards ?" })).getByLabelText("Oui"));
  await user.click(screen.getByRole("button", { name: "Valider" }));
  await screen.findAllByText("Oui");
};

describe("FdrInformationsPage — reprise d'un brouillon (pas un nouveau parcours de création)", () => {
  it("brouillon complet ouvert directement : les 5 sections sont déjà validées, sans repartir d'Assuré", async () => {
    mockDemande(demandeApi({}, FDR_COMPLET));
    renderWizard();

    expect(await screen.findByText("AXA Construction")).toBeInTheDocument();
    for (const titre of TITRES_SECTIONS) {
      expect(screen.getByRole("button", { name: `Modifier l'étape ${titre}` })).toBeInTheDocument();
    }
    expect(screen.queryByLabelText("Nom / raison sociale")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Valider" })).not.toBeInTheDocument();
    const sectionChantier = screen.getByRole("region", { name: "Étape verticale Chantier (validée)" });
    const ligneModificationStructure = within(sectionChantier).getByText("Modification de structure").closest("dt");
    expect(ligneModificationStructure?.nextElementSibling).toHaveTextContent("Oui");
  });

  it("brouillon où seule Questions métier est incomplète : les 4 premières sont validées, Questions métier est ouverte", async () => {
    mockDemande(demandeApi({}, FDR_QUESTIONS_METIER_INCOMPLETES));
    renderWizard();

    await screen.findByText("L'activité est-elle couverte par le contrat ?");
    for (const titre of ["Assuré", "Chantier", "Usage & calendrier", "Intervention"]) {
      expect(screen.getByRole("button", { name: `Modifier l'étape ${titre}` })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Modifier l'étape Questions métier" })).not.toBeInTheDocument();
  });

  it("retour depuis Pièces & risque avec un FDR complet : les 5 sections restent validées", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi({}, FDR_COMPLET));
    renderWizard(`/distributeur/demandes/${ID_DEMANDE}/pieces`);
    await screen.findByText("Pièces & risque (page)");

    await user.click(screen.getByRole("link", { name: "Retour aux informations (test)" }));

    expect(await screen.findByText("AXA Construction")).toBeInTheDocument();
    for (const titre of TITRES_SECTIONS) {
      expect(screen.getByRole("button", { name: `Modifier l'étape ${titre}` })).toBeInTheDocument();
    }
  });
});

describe("FdrInformationsPage — actions globales", () => {
  it("Retour à mes demandes navigue vers /distributeur", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    renderWizard();
    await screen.findByLabelText("Nom / raison sociale");

    await user.click(screen.getByRole("button", { name: "Retour à mes demandes" }));

    expect(await screen.findByText("Mes demandes (liste)")).toBeInTheDocument();
  });

  it("Confirmer les informations est toujours cliquable, même parcours non terminé (seul un PATCH en cours peut le désactiver)", async () => {
    mockDemande(demandeApi());
    renderWizard();
    await screen.findByLabelText("Nom / raison sociale");

    expect(screen.getByRole("button", { name: "Confirmer les informations" })).not.toBeDisabled();
  });
});

// Timeout étendu (15s) sur les tests de cette section : chacun rejoue les 5
// sections de `remplirLes5Sections` avant d'agir, ce qui dépasse le budget
// par défaut de Vitest sur une machine chargée.
describe("FdrInformationsPage — Confirmer les informations", () => {
  it(
    "formulaire valide : envoie le PATCH attendu puis navigue vers l'étape Pièces",
    async () => {
      const user = userEvent.setup();
      mockDemande(demandeApi());
      let corpsRecu: Record<string, unknown> | null = null;
      server.use(
        http.patch("*/demandes/:id/fdr/", async ({ request }) => {
          corpsRecu = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(corpsRecu);
        }),
      );
      renderWizard();
      await screen.findByLabelText("Nom / raison sociale");
      await remplirLes5Sections(user);

      await user.click(screen.getByRole("button", { name: "Confirmer les informations" }));

      expect(await screen.findByText("Pièces & risque (page)")).toBeInTheDocument();
      if (!corpsRecu) {
        throw new Error("Le corps du PATCH n'a pas été capturé par le handler MSW.");
      }
      const corps: Record<string, unknown> = corpsRecu;
      expect(corps.assure_nom).toBe("AXA Construction");
      expect(corps.type_chantier).toBe("NEUVE");
      expect(corps.modification_structure).toBeNull();
      expect(corps.montant_total).toBe("500000");
      expect(corps.date_debut).toBe("2026-01-10");
    },
    15000,
  );

  it(
    "erreur serveur au PATCH : reste sur Informations et affiche l'erreur",
    async () => {
      const user = userEvent.setup();
      mockDemande(demandeApi());
      server.use(http.patch("*/demandes/:id/fdr/", () => new HttpResponse(null, { status: 500 })));
      renderWizard();
      await screen.findByLabelText("Nom / raison sociale");
      await remplirLes5Sections(user);

      await user.click(screen.getByRole("button", { name: "Confirmer les informations" }));

      expect(
        await screen.findByText("Impossible d'enregistrer le formulaire de déclaration du risque."),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Confirmer les informations" })).toBeInTheDocument();
      expect(screen.queryByText("Pièces & risque (page)")).not.toBeInTheDocument();
    },
    15000,
  );

  it(
    "incohérence croisée révélée après coup (prestation >= nouveau montant_total) : rouvre Intervention, affiche l'erreur, sans PATCH ni navigation",
    async () => {
      // Aucun handler PATCH n'est enregistré pour /fdr/ dans ce test :
      // onUnhandledRequest: "error" (test/setup.ts) fait échouer le test si le
      // code tentait quand même d'envoyer la requête.
      const user = userEvent.setup();
      mockDemande(demandeApi());
      renderWizard();
      await screen.findByLabelText("Nom / raison sociale");
      await remplirLes5Sections(user);

      await user.click(screen.getByRole("button", { name: "Modifier l'étape Usage & calendrier" }));
      await user.clear(screen.getByLabelText("Montant total (€)"));
      await user.type(screen.getByLabelText("Montant total (€)"), "100000");
      await user.click(screen.getByRole("button", { name: "Valider" }));

      await user.click(screen.getByRole("button", { name: "Confirmer les informations" }));

      expect(
        await screen.findByText("Le montant de la prestation doit être strictement inférieur au montant total."),
      ).toBeInTheDocument();
           expect(screen.queryByRole("button", { name: "Modifier l'étape Intervention" })).not.toBeInTheDocument();
      expect(screen.queryByText("Pièces & risque (page)")).not.toBeInTheDocument();
      expect(
        screen.getByText("Certaines informations doivent être complétées et validées avant de continuer."),
      ).toBeInTheDocument();
    },
    15000,
  );

  it("formulaire incomplet dès le départ : bouton cliquable, aucun PATCH, aucune navigation, message global affiché, Assuré rouvert", async () => {
    // Aucun handler PATCH n'est enregistré pour /fdr/ : onUnhandledRequest: "error"
    // (test/setup.ts) ferait échouer le test si le code tentait quand même la requête.
    const user = userEvent.setup();
    mockDemande(demandeApi());
    renderWizard();
    await screen.findByLabelText("Nom / raison sociale");

    await user.click(screen.getByRole("button", { name: "Confirmer les informations" }));

    expect(
      await screen.findByText("Certaines informations doivent être complétées et validées avant de continuer."),
    ).toBeInTheDocument();
    expect(screen.getByText("Le nom de l'assuré est obligatoire.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nom / raison sociale")).toBeInTheDocument();
    expect(screen.queryByText("Pièces & risque (page)")).not.toBeInTheDocument();
  });

  it("Modifier une seule section d'un FDR complet : seule cette section devient éditable, les autres restent validées", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi({}, FDR_COMPLET));
    renderWizard();
    await screen.findByText("AXA Construction");

    await user.click(screen.getByRole("button", { name: "Modifier l'étape Chantier" }));

    expect(screen.getByLabelText("Nom du chantier")).toBeInTheDocument();
    for (const titre of ["Assuré", "Usage & calendrier", "Intervention", "Questions métier"]) {
      expect(screen.getByRole("button", { name: `Modifier l'étape ${titre}` })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Confirmer les informations" })).not.toBeDisabled();
  });

  it("Valider une section modifiée d'un FDR complet la revalide, sans forcer la progression dans les autres blocs", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi({}, FDR_COMPLET));
    renderWizard();
    await screen.findByText("AXA Construction");

    await user.click(screen.getByRole("button", { name: "Modifier l'étape Chantier" }));
    await user.clear(screen.getByLabelText("Nom du chantier"));
    await user.type(screen.getByLabelText("Nom du chantier"), "Tour Zénith");
    await user.click(screen.getByRole("button", { name: "Valider" }));

    expect(await screen.findByText("Tour Zénith")).toBeInTheDocument();
    for (const titre of TITRES_SECTIONS) {
      expect(screen.getByRole("button", { name: `Modifier l'étape ${titre}` })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Valider" })).not.toBeInTheDocument();
  });

  it("section ouverte via Modifier mais non revalidée : Confirmer ne PATCH pas même si les valeurs sont techniquement valides", async () => {
    // Aucun handler PATCH n'est enregistré pour /fdr/ : onUnhandledRequest: "error"
    // ferait échouer le test si le code tentait quand même la requête (le bouton
    // local "Valider" de la section garde donc son sens métier).
    const user = userEvent.setup();
    mockDemande(demandeApi({}, FDR_COMPLET));
    renderWizard();
    await screen.findByText("AXA Construction");

    await user.click(screen.getByRole("button", { name: "Modifier l'étape Chantier" }));
    await user.click(screen.getByRole("button", { name: "Confirmer les informations" }));

    expect(
      await screen.findByText("Certaines informations doivent être complétées et validées avant de continuer."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nom du chantier")).toBeInTheDocument();
    expect(screen.queryByText("Pièces & risque (page)")).not.toBeInTheDocument();
  });
});

describe("FdrInformationsPage — lecture seule (EN_COURS / TRAITE)", () => {
  it("affiche les 5 sections directement en restitution, sans Modifier ni Valider ni champ éditable", async () => {
    mockDemande(demandeApi({ statut: "EN_COURS" }, FDR_COMPLET));
    renderWizard();

    expect(await screen.findByText("AXA Construction")).toBeInTheDocument();
    expect(screen.getByText("Tour Horizon")).toBeInTheDocument();
    expect(screen.getByText("Lyon")).toBeInTheDocument();
    expect(screen.getByText("Rénovation complète des bureaux")).toBeInTheDocument();
    expect(screen.getByText(/Activité couverte/)).toBeInTheDocument();

    for (const titre of TITRES_SECTIONS) {
      expect(screen.getByRole("heading", { name: titre })).toBeInTheDocument();
    }

    expect(screen.queryByRole("button", { name: "Valider" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Modifier/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nom / raison sociale")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmer les informations" })).not.toBeInTheDocument();
  });

  it("comportement identique pour TRAITE", async () => {
    mockDemande(demandeApi({ statut: "TRAITE" }, FDR_COMPLET));
    renderWizard();

    expect(await screen.findByText("AXA Construction")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Modifier/ })).not.toBeInTheDocument();
  });
});

describe("FdrInformationsPage — SelectInput sans placeholder injecté", () => {
  it("ne propose que les options métier réelles sur Type de chantier, Usage et Type d'intervention", async () => {
    const user = userEvent.setup();
    mockDemande(demandeApi());
    renderWizard();
    await screen.findByLabelText("Nom / raison sociale");
    await user.type(screen.getByLabelText("Nom / raison sociale"), "AXA Construction");
    await user.type(screen.getByLabelText("Ville"), "Paris");
    await user.type(screen.getByLabelText("Numéro de contrat"), "123456789");
    await user.click(screen.getByRole("button", { name: "Valider" }));
    await screen.findByLabelText("Nom du chantier");

    const optionsTypeChantier = Array.from(
      (screen.getByLabelText("Type de chantier") as HTMLSelectElement).options,
    ).map((option) => option.textContent);
    expect(optionsTypeChantier).toEqual(["Sélectionner…", "Construction neuve", "Rénovation"]);
    expect(optionsTypeChantier.filter((label) => label === "Sélectionner…")).toHaveLength(1);
  });
});

describe("FdrInformationsPage — accessibilité", () => {
  it("ne présente aucune violation d'accessibilité détectable (axe) avec les 5 sections visibles", async () => {
    mockDemande(demandeApi());
    const { container } = renderWizard();
    await screen.findByLabelText("Nom / raison sociale");

    expect(await axe(container)).toHaveNoViolations();
  });

  it("ne présente aucune violation d'accessibilité détectable (axe) en lecture seule", async () => {
    mockDemande(demandeApi({ statut: "EN_COURS" }, FDR_COMPLET));
    const { container } = renderWizard();
    await screen.findByText("AXA Construction");

    expect(await axe(container)).toHaveNoViolations();
  });
});
