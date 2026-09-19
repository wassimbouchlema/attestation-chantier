import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { HttpResponse, delay, http } from "msw";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const NouvelleDemandeStub = () => <p>Formulaire nouvelle demande (page)</p>;

const renderPage = (chemin = "/distributeur") =>
  render(
    <AuthProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[chemin]}>
          <Routes>
            <Route path="/distributeur" element={<DistributeurHome />} />
            <Route path="/distributeur/demandes/nouvelle" element={<NouvelleDemandeStub />} />
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
  last_relance_at: null,
  assure_nom: "Assuré démo",
  chantier_nom: "Chantier démo",
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

describe("DistributeurHome — Nouvelle demande", () => {
  it("navigue vers le formulaire de création sans appeler l'API", async () => {
    const user = userEvent.setup();
    let appelsPost = 0;
    server.use(http.post("*/demandes/", () => {
      appelsPost += 1;
      return HttpResponse.json(creerDemande(), { status: 201 });
    }));
    renderPage();
    await screen.findByText("Aucune demande pour le moment.");

    await user.click(screen.getByRole("button", { name: "Nouvelle demande" }));

    expect(await screen.findByText("Formulaire nouvelle demande (page)")).toBeInTheDocument();
    expect(appelsPost).toBe(0);
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

describe("DistributeurHome — action par statut (Modifier / Consulter / Supprimer)", () => {
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

  it("BROUILLON : affiche aussi un bouton Supprimer", async () => {
    server.use(
      http.get("*/demandes/", () => HttpResponse.json(paginer([creerDemande({ statut: "BROUILLON" })]))),
    );
    renderPage();

    expect(await screen.findByRole("button", { name: /Supprimer/ })).toBeInTheDocument();
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

  it("EN_COURS : aucun bouton Supprimer", async () => {
    server.use(
      http.get("*/demandes/", () => HttpResponse.json(paginer([creerDemande({ statut: "EN_COURS" })]))),
    );
    renderPage();
    await screen.findByRole("cell", { name: "En cours" });

    expect(screen.queryByRole("button", { name: /Supprimer/ })).not.toBeInTheDocument();
  });
});

describe("DistributeurHome — suppression d'un brouillon", () => {
  it("Supprimer ouvre une modale de confirmation", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/demandes/", () => HttpResponse.json(paginer([creerDemande({ statut: "BROUILLON" })]))),
    );
    renderPage();
    await screen.findByRole("button", { name: /Supprimer/ });

    await user.click(screen.getByRole("button", { name: /Supprimer/ }));

    expect(await screen.findByRole("dialog", { name: "Supprimer ce brouillon ?" })).toBeInTheDocument();
    expect(
      screen.getByText("Cette action supprimera définitivement la demande et les pièces justificatives déjà ajoutées."),
    ).toBeInTheDocument();
  });

  it("Annuler ferme la modale sans envoyer de requête DELETE", async () => {
    const user = userEvent.setup();
    let appelsDelete = 0;
    server.use(
      http.get("*/demandes/", () => HttpResponse.json(paginer([creerDemande({ statut: "BROUILLON" })]))),
      http.delete("*/demandes/:id/", () => {
        appelsDelete += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Supprimer/ }));
    await screen.findByRole("dialog", { name: "Supprimer ce brouillon ?" });

    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(screen.queryByRole("dialog", { name: "Supprimer ce brouillon ?" })).not.toBeInTheDocument();
    expect(appelsDelete).toBe(0);
  });

  it("Confirmer supprime, ferme la modale, met à jour la liste et affiche 'Brouillon supprimé.'", async () => {
    const user = userEvent.setup();
    let demandeSupprimee = false;
    server.use(
      http.get("*/demandes/", () =>
        HttpResponse.json(paginer(demandeSupprimee ? [] : [creerDemande({ statut: "BROUILLON" })])),
      ),
      http.delete("*/demandes/:id/", () => {
        demandeSupprimee = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Supprimer/ }));
    await screen.findByRole("dialog", { name: "Supprimer ce brouillon ?" });

    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    expect(await screen.findByText("Brouillon supprimé.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Supprimer ce brouillon ?" })).not.toBeInTheDocument();
    expect(await screen.findByText("Aucune demande pour le moment.")).toBeInTheDocument();
  });

  it("affiche un message d'erreur si la suppression échoue", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/demandes/", () => HttpResponse.json(paginer([creerDemande({ statut: "BROUILLON" })]))),
      http.delete("*/demandes/:id/", () => new HttpResponse(null, { status: 500 })),
    );
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Supprimer/ }));
    await screen.findByRole("dialog", { name: "Supprimer ce brouillon ?" });

    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    expect(await screen.findByText("Impossible de supprimer ce brouillon.")).toBeInTheDocument();
  });
});

describe("DistributeurHome — décision et suivi", () => {
  const acceptee = creerDemande({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    statut: "TRAITE",
    decision: "ACCEPTEE",
    attestation_finale: { validated_at: "2026-09-19T10:00:00Z" },
  });
  const refusee = creerDemande({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", statut: "TRAITE", decision: "REFUSEE" });
  const enCours = creerDemande({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", statut: "EN_COURS", decision: null });
  const brouillon = creerDemande({ decision: null });

  const mockListe = (demandes: Demande[]) =>
    server.use(http.get("*/demandes/", () => HttpResponse.json(paginer(demandes))));

  it("affiche l'assuré et le chantier de chaque demande, « — » si le FDR est vide", async () => {
    mockListe([
      creerDemande({ assure_nom: "AXA Construction", chantier_nom: "Tour Horizon" }),
      creerDemande({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", assure_nom: "", chantier_nom: "" }),
    ]);
    renderPage();

    expect(await screen.findByRole("cell", { name: "AXA Construction" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Tour Horizon" })).toBeInTheDocument();
    const lignes = screen.getAllByRole("row").slice(1);
    expect(within(lignes[1]).getAllByRole("cell", { name: "—" })).toHaveLength(3);
  });

  it("affiche la colonne Décision, sans Dernière modification", async () => {
    mockListe([brouillon, enCours, acceptee, refusee]);
    renderPage();
    await screen.findByRole("cell", { name: "Acceptée" });

    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Assuré",
      "Chantier",
      "Statut",
      "Décision",
      "Date de création",
      "Actions",
    ]);
    expect(screen.getByRole("cell", { name: "Refusée" })).toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: "—" })).toHaveLength(2);
  });

  it("affiche les trois filtres avec leurs options, sans champ obligatoire", async () => {
    mockListe([brouillon]);
    renderPage();
    const options = async (libelle: string) =>
      Array.from(((await screen.findByLabelText(libelle)) as HTMLSelectElement).options).map((o) => o.textContent);

    expect(await options("Statut")).toEqual(["Tous les statuts", "Brouillon", "En cours", "Traité"]);
    expect(await options("Décision")).toEqual(["Toutes les décisions", "Acceptée", "Refusée", "En attente"]);
    expect(await options("Compléments")).toEqual(["Tous", "Compléments demandés", "Aucun complément demandé"]);
    expect(screen.getByLabelText("Statut")).not.toBeRequired();
  });

  it("initialise les trois filtres depuis l'URL et les envoie à l'API", async () => {
    const urls: string[] = [];
    server.use(
      http.get("*/demandes/", ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(paginer([enCours]));
      }),
    );
    renderPage("/distributeur?statut=EN_COURS&decision=EN_ATTENTE&complements=DEMANDES");
    await screen.findByRole("cell", { name: "En cours" });

    expect(screen.getByLabelText("Statut")).toHaveValue("EN_COURS");
    expect(screen.getByLabelText("Décision")).toHaveValue("EN_ATTENTE");
    expect(screen.getByLabelText("Compléments")).toHaveValue("DEMANDES");
    const params = new URL(urls.at(-1) ?? "").searchParams;
    expect(params.get("statut")).toBe("EN_COURS");
    expect(params.get("decision")).toBe("EN_ATTENTE");
    expect(params.get("complements")).toBe("DEMANDES");
  });

  it("ignore une valeur de filtre inconnue dans l'URL", async () => {
    const urls: string[] = [];
    server.use(
      http.get("*/demandes/", ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(paginer([brouillon]));
      }),
    );
    renderPage("/distributeur?complements=TOUS&decision=X");
    await screen.findByRole("cell", { name: "Brouillon" });

    expect(urls.at(-1)).not.toContain("complements=");
    expect(urls.at(-1)).not.toContain("decision=");
  });

  it("envoie decision seule puis combinée au statut, en revenant à la page 1", async () => {
    const user = userEvent.setup();
    const urls: string[] = [];
    server.use(
      http.get("*/demandes/", ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(paginer([brouillon]));
      }),
    );
    renderPage("/distributeur?page=2");
    await screen.findByRole("cell", { name: "Brouillon" });

    await user.selectOptions(screen.getByLabelText("Décision"), "En attente");
    await waitFor(() => expect(urls.at(-1)).toContain("decision=EN_ATTENTE"));
    expect(urls.at(-1)).not.toContain("page=2");
    expect(urls.at(-1)).not.toContain("statut=");

    await user.selectOptions(screen.getByLabelText("Statut"), "Traité");
    await user.selectOptions(screen.getByLabelText("Compléments"), "Aucun complément demandé");
    await waitFor(() => {
      expect(urls.at(-1)).toContain("statut=TRAITE");
      expect(urls.at(-1)).toContain("decision=EN_ATTENTE");
      expect(urls.at(-1)).toContain("complements=AUCUN");
    });
    await user.selectOptions(screen.getByLabelText("Compléments"), "Tous");
    await waitFor(() => expect(urls.at(-1)).not.toContain("complements="));
    expect(urls.at(-1)).toContain("statut=TRAITE");
  });

  it("propose le téléchargement uniquement pour une demande acceptée avec attestation finale", async () => {
    mockListe([brouillon, enCours, acceptee, refusee]);
    renderPage();
    await screen.findByRole("cell", { name: "Acceptée" });

    expect(screen.getAllByRole("button", { name: /Télécharger l'attestation/ })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: /Consulter/ })).toHaveLength(3);
    expect(screen.getByRole("link", { name: /Modifier/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Supprimer/ })).toBeInTheDocument();
  });

  it("télécharge le PDF final via le Blob authentifié", async () => {
    const user = userEvent.setup();
    const pdf = vi.fn(() => new HttpResponse("%PDF-1.4 final", { headers: { "Content-Type": "application/pdf" } }));
    mockListe([acceptee]);
    server.use(http.get("*/demandes/:id/attestation-finale/pdf/", pdf));
    URL.createObjectURL = vi.fn(() => "blob:final");
    URL.revokeObjectURL = vi.fn();
    let fichier: string | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      fichier = this.download;
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: /Télécharger l'attestation/ }));

    await waitFor(() => expect(fichier).toBe(`attestation-definitive-${acceptee.id}.pdf`));
    expect(pdf).toHaveBeenCalledTimes(1);
  });
});
