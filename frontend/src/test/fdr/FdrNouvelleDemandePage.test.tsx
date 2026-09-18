import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { AuthProvider } from "../../features/auth/AuthProvider";
import { FdrNouvelleDemandePage } from "../../pages/FdrNouvelleDemandePage/FdrNouvelleDemandePage";
import { createQueryClient } from "../../queryClient";
import { server } from "../server";
import { seedSession } from "../utils";

const renderPage = ({ strict = false }: { strict?: boolean } = {}) => {
  const arbre = (
    <AuthProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/distributeur/demandes/nouvelle"]}>
          <Routes>
            <Route path="/distributeur" element={<p>Mes demandes (page)</p>} />
            <Route path="/distributeur/demandes/nouvelle" element={<FdrNouvelleDemandePage />} />
            <Route path="/distributeur/demandes/:id/pieces" element={<PiecesStub />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthProvider>
  );
  return render(strict ? <StrictMode>{arbre}</StrictMode> : arbre);
};

const PiecesStub = () => {
  const { id } = useParams<{ id: string }>();
  return <p>Pièces & risque de la demande {id}</p>;
};

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

beforeEach(() => {
  seedSession("DISTRIBUTEUR");
});

describe("FdrNouvelleDemandePage — montage sans effet de bord", () => {
  it("le montage du formulaire n'envoie aucun POST /demandes/", async () => {
    let appelsPost = 0;
    server.use(http.post("*/demandes/", () => {
      appelsPost += 1;
      return new HttpResponse(null, { status: 500 });
    }));

    renderPage();
    await screen.findByLabelText("Nom / raison sociale");

    expect(appelsPost).toBe(0);
  });

  it("abandon avant confirmation (aucun clic sur Confirmer) : aucun POST /demandes/", async () => {
    const user = userEvent.setup();
    let appelsPost = 0;
    server.use(http.post("*/demandes/", () => {
      appelsPost += 1;
      return new HttpResponse(null, { status: 500 });
    }));

    renderPage();
    await screen.findByLabelText("Nom / raison sociale");
    await user.type(screen.getByLabelText("Nom / raison sociale"), "Saisie non confirmée");
    await user.click(screen.getByRole("button", { name: "Retour à mes demandes" }));

    expect(await screen.findByText("Mes demandes (page)")).toBeInTheDocument();
    expect(appelsPost).toBe(0);
  });

  it("React StrictMode ne crée jamais automatiquement de demande à l'ouverture", async () => {
    let appelsPost = 0;
    server.use(http.post("*/demandes/", () => {
      appelsPost += 1;
      return new HttpResponse(null, { status: 500 });
    }));

    renderPage({ strict: true });
    await screen.findByLabelText("Nom / raison sociale");

    expect(appelsPost).toBe(0);
  });
});

describe("FdrNouvelleDemandePage — Confirmer les informations", () => {
  it(
    "formulaire valide : POST une seule fois avec le FDR, puis navigue vers Pièces avec l'UUID reçu",
    async () => {
      const user = userEvent.setup();
      let appelsPost = 0;
      let corpsRecu: Record<string, unknown> | null = null;
      server.use(
        http.post("*/demandes/", async ({ request }) => {
          appelsPost += 1;
          corpsRecu = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(
            {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              distributeur: 1,
              statut: "BROUILLON",
              created_at: "2026-09-18T08:00:00Z",
              updated_at: "2026-09-18T08:00:00Z",
              envoye_at: null,
              commentaire_distributeur: "",
              fdr: (corpsRecu as { fdr: unknown }).fdr,
            },
            { status: 201 },
          );
        }),
      );

      renderPage();
      await screen.findByLabelText("Nom / raison sociale");
      await remplirLes5Sections(user);

      await user.click(screen.getByRole("button", { name: "Confirmer les informations" }));

      expect(
        await screen.findByText("Pièces & risque de la demande aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
      ).toBeInTheDocument();
      expect(appelsPost).toBe(1);
      const corps: Record<string, unknown> = corpsRecu as unknown as Record<string, unknown>;
      const fdrEnvoye = corps.fdr as Record<string, unknown>;
      expect(fdrEnvoye.assure_nom).toBe("AXA Construction");
      expect(fdrEnvoye.type_chantier).toBe("NEUVE");
    },
    15000,
  );

  it("formulaire incomplet : bouton cliquable, aucun POST, message global affiché, reste sur le formulaire", async () => {
    const user = userEvent.setup();
    let appelsPost = 0;
    server.use(http.post("*/demandes/", () => {
      appelsPost += 1;
      return new HttpResponse(null, { status: 500 });
    }));

    renderPage();
    await screen.findByLabelText("Nom / raison sociale");

    await user.click(screen.getByRole("button", { name: "Confirmer les informations" }));

    const message = await screen.findByText(
      "Certaines informations doivent être complétées et validées avant de continuer.",
    );
    expect(appelsPost).toBe(0);
    expect(screen.getByLabelText("Nom / raison sociale")).toBeInTheDocument();
    const sectionAssure = screen.getByRole("heading", { name: /Assuré/ });
    // Même règle que l'erreur backend : le message global (ici de validation
    // locale) est rendu avant les sections, jamais en bas de page.
    expect(message.compareDocumentPosition(sectionAssure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it(
    "erreur de création (FDR_INVALIDE renvoyé par le backend) : reste sur le formulaire, message d'erreur affiché",
    async () => {
      const user = userEvent.setup();
      server.use(
        http.post("*/demandes/", () =>
          HttpResponse.json(
            { code: "FDR_INVALIDE", erreurs: { assure_nom: "Le nom de l'assuré est obligatoire." } },
            { status: 400 },
          ),
        ),
      );

      renderPage();
      await screen.findByLabelText("Nom / raison sociale");
      await remplirLes5Sections(user);

      await user.click(screen.getByRole("button", { name: "Confirmer les informations" }));

      expect(
        await screen.findByText("Certaines informations du formulaire sont incomplètes ou incohérentes."),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Pièces & risque de la demande/)).not.toBeInTheDocument();
    },
    15000,
  );

  it(
    "le message d'erreur de création est rendu avant les sections du formulaire (pas en bas de page)",
    async () => {
      const user = userEvent.setup();
      server.use(
        http.post("*/demandes/", () =>
          HttpResponse.json(
            { code: "FDR_INVALIDE", erreurs: { assure_nom: "Le nom de l'assuré est obligatoire." } },
            { status: 400 },
          ),
        ),
      );

      renderPage();
      await screen.findByLabelText("Nom / raison sociale");
      await remplirLes5Sections(user);

      await user.click(screen.getByRole("button", { name: "Confirmer les informations" }));

      const message = await screen.findByText("Certaines informations du formulaire sont incomplètes ou incohérentes.");
      const sectionAssure = screen.getByRole("heading", { name: /Assuré/ });
      // DOCUMENT_POSITION_FOLLOWING sur sectionAssure vu depuis message : message précède bien la section dans le document.
      expect(message.compareDocumentPosition(sectionAssure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    },
    15000,
  );

  it(
    "erreur technique (500) : reste sur le formulaire, message générique affiché",
    async () => {
      const user = userEvent.setup();
      server.use(http.post("*/demandes/", () => new HttpResponse(null, { status: 500 })));

      renderPage();
      await screen.findByLabelText("Nom / raison sociale");
      await remplirLes5Sections(user);

      await user.click(screen.getByRole("button", { name: "Confirmer les informations" }));

      expect(await screen.findByText("Impossible de créer la demande.")).toBeInTheDocument();
      expect(screen.queryByText(/Pièces & risque de la demande/)).not.toBeInTheDocument();
    },
    15000,
  );
});
