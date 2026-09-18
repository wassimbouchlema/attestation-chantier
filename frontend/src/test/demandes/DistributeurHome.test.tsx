import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { HttpResponse, delay, http } from "msw";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import type { Demande, DemandesPaginees } from "../../api/demandes";
import { AuthProvider } from "../../features/auth/AuthProvider";
import { createQueryClient } from "../../queryClient";
import { DistributeurHome } from "../../pages/DistributeurHome/DistributeurHome";
import { server } from "../server";
import { seedSession } from "../utils";

const DemandeDetailStub = () => {
  const { id } = useParams<{ id: string }>();
  return <p>Détail de la demande {id}</p>;
};

const ConsultationStub = () => {
  const { id } = useParams<{ id: string }>();
  return <p>Consultation de la demande {id}</p>;
};

const renderPage = (chemin = "/distributeur") =>
  render(
    <AuthProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[chemin]}>
          <Routes>
            <Route path="/distributeur" element={<DistributeurHome />} />
            <Route path="/distributeur/demandes/:id" element={<DemandeDetailStub />} />
            <Route path="/distributeur/demandes/:id/consultation" element={<ConsultationStub />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthProvider>,
  );

const creerDemande = (overrides: Partial<Demande> = {}): Demande => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  distributeur: 1,
  statut: "BROUILLON",
  created_at: "2026-09-10T08:00:00Z",
  updated_at: "2026-09-11T08:00:00Z",
  envoye_at: null,
  ...overrides,
});

const paginer = (results: Demande[], overrides: Partial<DemandesPaginees> = {}): DemandesPaginees => ({
  count: results.length,
  next: null,
  previous: null,
  results,
  ...overrides,
});

beforeEach(() => {
  seedSession("DISTRIBUTEUR");
});

describe("DistributeurHome — chargement et affichage", () => {
  it("affiche un état de chargement puis la liste renvoyée par l'API", async () => {
    server.use(http.get("*/demandes/", () => HttpResponse.json(paginer([creerDemande()]))));
    renderPage();

    expect(screen.getByText(/Chargement en cours/)).toBeInTheDocument();
    expect(await screen.findByRole("cell", { name: "Brouillon" })).toBeInTheDocument();
  });

  it("affiche l'état vide réel quand le distributeur n'a aucune demande", async () => {
    server.use(http.get("*/demandes/", () => HttpResponse.json(paginer([]))));
    renderPage();

    expect(await screen.findByText("Aucune demande pour le moment.")).toBeInTheDocument();
  });

  it("affiche une erreur explicite avec un bouton Réessayer en cas d'échec API", async () => {
    server.use(http.get("*/demandes/", () => new HttpResponse(null, { status: 500 })));
    renderPage();

    const message = await screen.findByText("Impossible de récupérer vos demandes.");
    expect(message.closest('[role="alert"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });

  it("ne présente aucune violation d'accessibilité détectable (axe) avec une liste garnie", async () => {
    server.use(http.get("*/demandes/", () => HttpResponse.json(paginer([creerDemande()]))));
    const { container } = renderPage();
    await screen.findByRole("cell", { name: "Brouillon" });

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("DistributeurHome — filtre statut", () => {
  it("envoie le statut sélectionné en query param à l'API et affiche un message distinct si le résultat est vide", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/demandes/", ({ request }) => {
        const statut = new URL(request.url).searchParams.get("statut");
        return HttpResponse.json(paginer(statut ? [] : [creerDemande()]));
      }),
    );
    renderPage();
    await screen.findByRole("cell", { name: "Brouillon" });

    await user.selectOptions(screen.getByLabelText("Statut"), "Traité");

    expect(await screen.findByText("Aucune demande ne correspond à ce filtre.")).toBeInTheDocument();
  });

  it("revient à la page 1 (pas de query param page) lors d'un changement de filtre", async () => {
    const user = userEvent.setup();
    const urlsAppelees: string[] = [];
    server.use(
      http.get("*/demandes/", ({ request }) => {
        urlsAppelees.push(request.url);
        return HttpResponse.json(
          paginer(
            Array.from({ length: 10 }, (_, index) => creerDemande({ id: `demande-${index}` })),
            { count: 15 },
          ),
        );
      }),
    );
    renderPage("/distributeur?page=2");
    await screen.findAllByRole("cell", { name: "Brouillon" });

    await user.selectOptions(screen.getByLabelText("Statut"), "En cours");

    await waitFor(() => {
      const derniereUrl = urlsAppelees.at(-1) ?? "";
      expect(derniereUrl).toContain("statut=EN_COURS");
      expect(derniereUrl).not.toContain("page=2");
    });
  });
});

describe("DistributeurHome — pagination", () => {
  it("demande la page suivante au clic sur le bouton de pagination", async () => {
    const user = userEvent.setup();
    const urlsAppelees: string[] = [];
    server.use(
      http.get("*/demandes/", ({ request }) => {
        urlsAppelees.push(request.url);
        return HttpResponse.json(
          paginer(
            Array.from({ length: 10 }, (_, index) => creerDemande({ id: `demande-${index}` })),
            { count: 15 },
          ),
        );
      }),
    );
    renderPage();
    await screen.findAllByRole("cell", { name: "Brouillon" });

    await user.click(screen.getByRole("button", { name: "Page suivante des demandes" }));

    await waitFor(() => expect(urlsAppelees.at(-1)).toContain("page=2"));
  });
});

describe("DistributeurHome — obsolescence des réponses (AbortController)", () => {
  it("n'affiche pas une réponse lente devenue obsolète après un changement de filtre", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/demandes/", async ({ request }) => {
        const statut = new URL(request.url).searchParams.get("statut");
        if (!statut) {
          await delay(200);
          return HttpResponse.json(paginer([creerDemande({ id: "lente-sans-filtre" })]));
        }
        return HttpResponse.json(paginer([creerDemande({ id: "rapide-en-cours", statut: "EN_COURS" })]));
      }),
    );
    renderPage();

    await user.selectOptions(screen.getByLabelText("Statut"), "En cours");

    expect(await screen.findByRole("cell", { name: "En cours" })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(screen.queryByRole("cell", { name: "Brouillon" })).not.toBeInTheDocument();
  });
});

describe("DistributeurHome — création d'une demande", () => {
  it("crée la demande puis navigue directement vers son détail", async () => {
    const user = userEvent.setup();
    server.use(http.post("*/demandes/", () => HttpResponse.json(creerDemande({ id: "nouvelle-demande" }), { status: 201 })));
    renderPage();
    await screen.findByText("Aucune demande pour le moment.");

    await user.click(screen.getByRole("button", { name: "Nouvelle demande" }));

    expect(await screen.findByText("Détail de la demande nouvelle-demande")).toBeInTheDocument();
  });

  it("désactive le bouton pendant la création et n'envoie qu'une seule requête au double clic", async () => {
    const user = userEvent.setup();
    let appelsCreation = 0;
    server.use(
      http.post("*/demandes/", async () => {
        appelsCreation += 1;
        await delay(100);
        return HttpResponse.json(creerDemande(), { status: 201 });
      }),
    );
    renderPage();
    await screen.findByText("Aucune demande pour le moment.");

    const bouton = screen.getByRole("button", { name: "Nouvelle demande" });
    await user.click(bouton);
    await user.click(bouton);

    await screen.findByText(/Détail de la demande/);
    expect(appelsCreation).toBe(1);
  });

  it("affiche une erreur de création sans naviguer, et réactive le bouton", async () => {
    const user = userEvent.setup();
    server.use(http.post("*/demandes/", () => new HttpResponse(null, { status: 500 })));
    renderPage();
    await screen.findByText("Aucune demande pour le moment.");

    await user.click(screen.getByRole("button", { name: "Nouvelle demande" }));

    expect(await screen.findByText("Impossible de créer la demande.")).toBeInTheDocument();
    expect(screen.getByText("Aucune demande pour le moment.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nouvelle demande" })).not.toBeDisabled();
  });
});

describe("DistributeurHome — message de succès (état de navigation)", () => {
  it("affiche le message ponctuel transmis via le state de navigation (ex. brouillon enregistré)", async () => {
    server.use(http.get("*/demandes/", () => HttpResponse.json(paginer([]))));
    render(
      <AuthProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter
            initialEntries={[
              {
                pathname: "/distributeur",
                state: { successMessage: "Demande enregistrée en brouillon. Vous pourrez la reprendre ultérieurement." },
              },
            ]}
          >
            <Routes>
              <Route path="/distributeur" element={<DistributeurHome />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </AuthProvider>,
    );

    expect(
      await screen.findByText("Demande enregistrée en brouillon. Vous pourrez la reprendre ultérieurement."),
    ).toBeInTheDocument();
  });

  it("n'affiche aucun message quand la page est ouverte sans état de navigation", async () => {
    server.use(http.get("*/demandes/", () => HttpResponse.json(paginer([]))));
    renderPage();
    await screen.findByText("Aucune demande pour le moment.");

    expect(screen.queryByText(/enregistrée en brouillon/)).not.toBeInTheDocument();
  });
});

describe("DistributeurHome — action par statut (Modifier / Consulter)", () => {
  it("BROUILLON : le lien Modifier ouvre le wizard", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/demandes/", () => HttpResponse.json(paginer([creerDemande({ statut: "BROUILLON" })]))),
    );
    renderPage();
    await screen.findByRole("cell", { name: "Brouillon" });

    await user.click(screen.getByRole("link", { name: /Modifier/ }));

    expect(await screen.findByText(/Détail de la demande/)).toBeInTheDocument();
  });

  it("EN_COURS : le lien Consulter ouvre la consultation en lecture seule", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/demandes/", () => HttpResponse.json(paginer([creerDemande({ statut: "EN_COURS" })]))),
    );
    renderPage();
    await screen.findByRole("cell", { name: "En cours" });

    await user.click(screen.getByRole("link", { name: /Consulter/ }));

    expect(await screen.findByText(/Consultation de la demande/)).toBeInTheDocument();
  });
});
