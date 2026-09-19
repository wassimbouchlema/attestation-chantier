import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationApi, NotificationsResponseApi } from "../../api/notifications";
import { AuthProvider } from "../../features/auth/AuthProvider";
import { ClocheNotifications } from "../../features/notifications/components/ClocheNotifications/ClocheNotifications";
import { AppShell } from "../../layout/AppShell";
import { createQueryClient } from "../../queryClient";
import { server } from "../server";
import { seedSession } from "../utils";

const DetailSiegeStub = () => <p>Détail SIÈGE de la demande (page)</p>;
const DetailDistributeurStub = () => <p>Détail DISTRIBUTEUR de la demande (page)</p>;

const renderCloche = (role: "SIEGE" | "DISTRIBUTEUR" = "SIEGE") =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/${role.toLowerCase()}`]}>
        <p>Hors composant</p>
        <Routes>
          <Route path="/siege" element={<ClocheNotifications role="SIEGE" />} />
          <Route path="/distributeur" element={<ClocheNotifications role="DISTRIBUTEUR" />} />
          <Route path="/siege/demandes/:id" element={<DetailSiegeStub />} />
          <Route path="/distributeur/demandes/:id" element={<DetailDistributeurStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const renderAppShell = () =>
  render(
    <AuthProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <AppShell>
            <p>Contenu</p>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthProvider>,
  );

const notification = (overrides: Partial<NotificationApi> & Pick<NotificationApi, "id" | "created_at" | "message">): NotificationApi => ({
  type_notification: "RELANCE",
  titre: "Demande relancée",
  demande_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  seen_at: null,
  ...overrides,
});

const NOTIFICATIONS: NotificationApi[] = [
  notification({ id: "notif-1", created_at: "2026-09-18T14:32:00Z", titre: "Nouvelle demande reçue", message: "Première relance transmise.", seen_at: null }),
  notification({ id: "notif-2", created_at: "2026-09-18T13:00:00Z", message: "Deuxième relance transmise.", seen_at: null }),
  notification({ id: "notif-3", created_at: "2026-09-18T12:00:00Z", message: "Troisième relance transmise.", seen_at: "2026-09-16T10:00:00Z" }),
  notification({ id: "notif-4", created_at: "2026-09-18T11:00:00Z", message: "Quatrième relance transmise.", seen_at: "2026-09-16T10:00:00Z" }),
  notification({ id: "notif-5", created_at: "2026-09-18T10:00:00Z", message: "Cinquième relance transmise.", seen_at: "2026-09-16T10:00:00Z" }),
  notification({ id: "notif-6", created_at: "2026-09-18T09:00:00Z", message: "Sixième relance transmise.", seen_at: "2026-09-16T10:00:00Z" }),
  notification({ id: "notif-7", created_at: "2026-09-18T08:00:00Z", message: "Septième relance transmise.", seen_at: null }),
  notification({ id: "notif-8", created_at: "2026-09-18T07:00:00Z", message: "Huitième relance transmise.", seen_at: "2026-09-16T10:00:00Z" }),
];

/** Mock avec état serveur mutable : `marquer-vues` persiste réellement `seen_at`, comme le vrai backend. */
const mockNotificationsMutable = (initiales: NotificationApi[]) => {
  let etat = initiales.map((n) => ({ ...n }));
  const appelsBatch: string[][] = [];

  server.use(
    http.get("*/notifications/", () => {
      const reponse: NotificationsResponseApi = {
        non_vues: etat.filter((n) => n.seen_at === null).length,
        notifications: etat,
      };
      return HttpResponse.json(reponse);
    }),
    http.post("*/notifications/marquer-vues/", async ({ request }) => {
      const body = (await request.json()) as { ids: string[] };
      appelsBatch.push(body.ids);
      etat = etat.map((n) => (body.ids.includes(n.id) ? { ...n, seen_at: "2026-09-18T15:00:00Z" } : n));
      return HttpResponse.json({ marquees: body.ids.length });
    }),
  );

  return { appelsBatch };
};

const mockNotifications = (reponse: NotificationsResponseApi) => {
  server.use(
    http.get("*/notifications/", () => HttpResponse.json(reponse)),
    http.post("*/notifications/marquer-vues/", async ({ request }) => {
      const body = (await request.json()) as { ids: string[] };
      return HttpResponse.json({ marquees: body.ids.length });
    }),
  );
};

beforeEach(() => {
  seedSession("SIEGE");
});

describe("ClocheNotifications — badge et aria-label", () => {
  it("est montée par AppShell pour le distributeur", async () => {
    seedSession("DISTRIBUTEUR");
    mockNotifications({ non_vues: 1, notifications: NOTIFICATIONS.slice(0, 1) });
    renderAppShell();

    expect(await screen.findByRole("button", { name: "Notifications, 1 nouvelle" })).toBeInTheDocument();
  });

  it("affiche le nombre de notifications non vues", async () => {
    mockNotifications({ non_vues: 2, notifications: NOTIFICATIONS.slice(0, 2) });
    renderCloche();

    expect(await screen.findByText("2")).toBeInTheDocument();
  });

  it("affiche 9+ au-delà de 9 non vues", async () => {
    mockNotifications({ non_vues: 12, notifications: NOTIFICATIONS });
    renderCloche();

    expect(await screen.findByText("9+")).toBeInTheDocument();
  });

  it("aucun badge quand non_vues vaut 0", async () => {
    mockNotifications({ non_vues: 0, notifications: [] });
    renderCloche();
    await screen.findByRole("button", { name: "Notifications" });

    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("aria-label de la cloche reflète le nombre de non vues, avec accord singulier/pluriel", async () => {
    mockNotifications({ non_vues: 1, notifications: NOTIFICATIONS.slice(0, 1) });
    renderCloche();

    expect(await screen.findByRole("button", { name: "Notifications, 1 nouvelle" })).toBeInTheDocument();
  });

  it("le panneau a un nom accessible Notifications", async () => {
    const user = userEvent.setup();
    mockNotifications({ non_vues: 0, notifications: [] });
    renderCloche();
    await user.click(await screen.findByRole("button", { name: "Notifications" }));

    expect(screen.getByRole("region", { name: "Notifications" })).toBeInTheDocument();
  });
});

describe("ClocheNotifications — ouverture, fermeture, clavier", () => {
  it("le clic ouvre le panneau et affiche titre, message, date ; les notifications déjà vues restent visibles", async () => {
    const user = userEvent.setup();
    mockNotifications({ non_vues: 1, notifications: [NOTIFICATIONS[0], NOTIFICATIONS[2]] });
    renderCloche();
    await screen.findByText("1");

    await user.click(screen.getByRole("button", { name: /Notifications/ }));

    expect(screen.getByText("Nouvelle demande reçue")).toBeInTheDocument();
    expect(screen.getByText("Première relance transmise.")).toBeInTheDocument();
    expect(screen.getByText("Troisième relance transmise.")).toBeInTheDocument();
    expect(screen.getByText("18/09/2026 à 16:32")).toBeInTheDocument();
  });

  it("Escape ferme le panneau et rend le focus à la cloche", async () => {
    const user = userEvent.setup();
    mockNotifications({ non_vues: 1, notifications: NOTIFICATIONS.slice(0, 1) });
    renderCloche();
    const bouton = await screen.findByRole("button", { name: /Notifications/ });
    await user.click(bouton);
    await screen.findByRole("region", { name: "Notifications" });

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("region", { name: "Notifications" })).not.toBeInTheDocument();
    expect(bouton).toHaveFocus();
  });

  it("un clic extérieur ferme le panneau", async () => {
    const user = userEvent.setup();
    mockNotifications({ non_vues: 1, notifications: NOTIFICATIONS.slice(0, 1) });
    renderCloche();
    await user.click(await screen.findByRole("button", { name: /Notifications/ }));
    await screen.findByRole("region", { name: "Notifications" });

    await user.click(screen.getByText("Hors composant"));

    expect(screen.queryByRole("region", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it("aria-expanded/aria-controls reflètent l'état ouvert", async () => {
    const user = userEvent.setup();
    mockNotifications({ non_vues: 0, notifications: [] });
    renderCloche();
    const bouton = await screen.findByRole("button", { name: "Notifications" });
    expect(bouton).toHaveAttribute("aria-expanded", "false");

    await user.click(bouton);

    expect(bouton).toHaveAttribute("aria-expanded", "true");
    const panneau = screen.getByRole("region", { name: "Notifications" });
    expect(bouton.getAttribute("aria-controls")).toBe(panneau.id);
  });
});

describe("ClocheNotifications — état Nouveau et marquage vues", () => {
  it("affiche 'Nouveau' seulement pour les notifications encore non vues", async () => {
    const user = userEvent.setup();
    mockNotifications({ non_vues: 1, notifications: [NOTIFICATIONS[0], NOTIFICATIONS[2]] });
    renderCloche();
    await user.click(await screen.findByRole("button", { name: /Notifications/ }));

    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("Nouveau")).toBeInTheDocument();
    expect(within(items[1]).queryByText("Nouveau")).not.toBeInTheDocument();
  });

  it("marque en un seul appel batch uniquement les notifications affichées et encore non vues", async () => {
    const user = userEvent.setup();
    const { appelsBatch } = mockNotificationsMutable(NOTIFICATIONS.slice(0, 3));
    renderCloche();
    await screen.findByText("2");

    await user.click(screen.getByRole("button", { name: /Notifications/ }));

    await vi.waitFor(() => expect(appelsBatch).toHaveLength(1));
    expect(appelsBatch[0].sort()).toEqual(["notif-1", "notif-2"]);
  });

  it("'Nouveau' reste affiché pendant l'ouverture même après succès du POST et invalidation", async () => {
    const user = userEvent.setup();
    mockNotificationsMutable(NOTIFICATIONS.slice(0, 3));
    renderCloche();
    await user.click(await screen.findByRole("button", { name: /Notifications/ }));
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("Nouveau")).toBeInTheDocument();

    // Laisse le POST persister seen_at et le refetch revenir : "Nouveau" doit pourtant persister (snapshot local).
    await new Promise((resolve) => setTimeout(resolve, 50));

    const itemsApres = screen.getAllByRole("listitem");
    expect(within(itemsApres[0]).getByText("Nouveau")).toBeInTheDocument();
  });

  it("après fermeture puis réouverture, les notifications marquées apparaissent sans 'Nouveau'", async () => {
    const user = userEvent.setup();
    const { appelsBatch } = mockNotificationsMutable(NOTIFICATIONS.slice(0, 3));
    renderCloche();
    const bouton = await screen.findByRole("button", { name: /Notifications/ });
    await user.click(bouton);
    await vi.waitFor(() => expect(appelsBatch).toHaveLength(1));

    await user.keyboard("{Escape}");
    await user.click(bouton);

    const items = await screen.findAllByRole("listitem");
    expect(within(items[0]).queryByText("Nouveau")).not.toBeInTheDocument();
    expect(within(items[1]).queryByText("Nouveau")).not.toBeInTheDocument();
    // Aucune notification restante à marquer : pas de second appel batch.
    expect(appelsBatch).toHaveLength(1);
  });
});

describe("ClocheNotifications — badge après marquage", () => {
  const QUATRE_NON_VUES: NotificationApi[] = [
    notification({ id: "badge-1", created_at: "2026-09-19T10:00:00Z", message: "Une." }),
    notification({ id: "badge-2", created_at: "2026-09-19T09:00:00Z", message: "Deux." }),
    notification({ id: "badge-3", created_at: "2026-09-19T08:00:00Z", message: "Trois." }),
    notification({ id: "badge-4", created_at: "2026-09-19T07:00:00Z", message: "Quatre." }),
  ];

  it("4 non vues (toutes affichées) : le badge passe à 0 après le POST batch, et le backend confirme non_vues=0", async () => {
    const user = userEvent.setup();
    mockNotificationsMutable(QUATRE_NON_VUES);
    renderCloche();
    expect(await screen.findByText("4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Notifications/ }));

    await vi.waitFor(() => expect(document.querySelector(".cloche-notifications__badge")).toBeNull());

    // Reflète directement `non_vues` du prochain GET (état serveur mutable) : source de vérité, pas un compteur local.
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(document.querySelector(".cloche-notifications__badge")).toBeNull();
  });

  it("une 4e non vue hors de la première page : seules les 3 affichées sont marquées, le badge reste à 1", async () => {
    const user = userEvent.setup();
    const septItems: NotificationApi[] = [
      notification({ id: "p1", created_at: "2026-09-19T16:00:00Z", message: "Une." }),
      notification({ id: "p2", created_at: "2026-09-19T15:00:00Z", message: "Deux.", seen_at: "2026-09-16T10:00:00Z" }),
      notification({ id: "p3", created_at: "2026-09-19T14:00:00Z", message: "Trois." }),
      notification({ id: "p4", created_at: "2026-09-19T13:00:00Z", message: "Quatre.", seen_at: "2026-09-16T10:00:00Z" }),
      notification({ id: "p5", created_at: "2026-09-19T12:00:00Z", message: "Cinq." }),
      notification({ id: "p6", created_at: "2026-09-19T11:00:00Z", message: "Six.", seen_at: "2026-09-16T10:00:00Z" }),
      notification({ id: "p7", created_at: "2026-09-19T10:00:00Z", message: "Sept (hors page 1)." }),
    ];
    const { appelsBatch } = mockNotificationsMutable(septItems);
    renderCloche();
    expect(await screen.findByText("4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Notifications/ }));

    await vi.waitFor(() => expect(appelsBatch).toHaveLength(1));
    expect(appelsBatch[0].sort()).toEqual(["p1", "p3", "p5"]);
    expect(await screen.findByText("1")).toBeInTheDocument();
  });
});

describe("ClocheNotifications — liste courte et pagination", () => {
  it("n'affiche que les 6 notifications les plus récentes, avec un bouton Afficher plus", async () => {
    const user = userEvent.setup();
    mockNotificationsMutable(NOTIFICATIONS);
    renderCloche();
    await user.click(await screen.findByRole("button", { name: /Notifications/ }));

    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.queryByText("Septième relance transmise.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Afficher plus" })).toBeInTheDocument();
  });

  it("Afficher plus ajoute les notifications suivantes et marque en batch uniquement les nouvelles désormais affichées", async () => {
    const user = userEvent.setup();
    const { appelsBatch } = mockNotificationsMutable(NOTIFICATIONS);
    renderCloche();
    await user.click(await screen.findByRole("button", { name: /Notifications/ }));
    await vi.waitFor(() => expect(appelsBatch).toHaveLength(1));
    expect(appelsBatch[0].sort()).toEqual(["notif-1", "notif-2"]);

    await user.click(screen.getByRole("button", { name: "Afficher plus" }));

    expect(await screen.findByText("Septième relance transmise.")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    await vi.waitFor(() => expect(appelsBatch).toHaveLength(2));
    expect(appelsBatch[1]).toEqual(["notif-7"]);
  });
});

describe("ClocheNotifications — navigation", () => {
  it("clic sur une notification : navigue vers /siege/demandes/{demandeId} et ferme le panneau", async () => {
    const user = userEvent.setup();
    mockNotificationsMutable(NOTIFICATIONS.slice(0, 2));
    renderCloche();
    await user.click(await screen.findByRole("button", { name: /Notifications/ }));

    await user.click(screen.getByText("Nouvelle demande reçue"));

    expect(await screen.findByText("Détail SIÈGE de la demande (page)")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it.each([
    ["COMPLEMENTS_DEMANDES", "Compléments demandés"],
    ["DEMANDE_REFUSEE", "Demande refusée"],
    ["DEMANDE_ACCEPTEE", "Demande acceptée"],
  ] as const)("%s côté distributeur : affiche le badge et navigue vers sa demande", async (typeNotification, titre) => {
    seedSession("DISTRIBUTEUR");
    const user = userEvent.setup();
    mockNotificationsMutable([
      notification({
        id: `notif-${typeNotification}`,
        type_notification: typeNotification,
        titre,
        message: "Message du siège.",
        created_at: "2026-09-19T10:00:00Z",
      }),
    ]);
    renderCloche("DISTRIBUTEUR");

    expect(await screen.findByRole("button", { name: "Notifications, 1 nouvelle" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.getByText(titre)).toBeInTheDocument();
    await user.click(screen.getByText(titre));

    expect(await screen.findByText("Détail DISTRIBUTEUR de la demande (page)")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Notifications" })).not.toBeInTheDocument();
  });
});
