import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it } from "vitest";

import { AuthProvider } from "../../features/auth/AuthProvider";
import { createQueryClient } from "../../queryClient";
import { AppRouter } from "../../routes/AppRouter";
import { seedSession } from "../utils";

const irVers = (chemin: string) => {
  window.history.pushState({}, "", chemin);
};

const renderAppRouter = () => {
  return render(
    <AuthProvider>
      <QueryClientProvider client={createQueryClient()}>
        <AppRouter />
      </QueryClientProvider>
    </AuthProvider>,
  );
};

describe("AppRouter — résolution rôle -> accueil", () => {
  beforeEach(() => {
    irVers("/");
  });

  it("redirige vers /login quand personne n'est connecté", async () => {
    renderAppRouter();

    expect(await screen.findByRole("heading", { name: "Connexion", level: 1 })).toBeInTheDocument();
  });

  it("redirige un DISTRIBUTEUR connecté vers /distributeur, sans violation d'accessibilité détectable (axe)", async () => {
    seedSession("DISTRIBUTEUR");
    const { container } = renderAppRouter();

    expect(await screen.findByRole("heading", { name: /Mes demandes/ })).toBeInTheDocument();
    // heading-order (règle axe "best-practice", pas un critère WCAG/RGAA) est
    // désactivée ici uniquement : EditorialMessage impose un <h4> sans offrir
    // de prop de niveau (vérifié dans son .d.ts), ce qui saute h1 -> h4 sur
    // cet état vide. Écart accepté et documenté (voir DistributeurHome.tsx),
    // à réévaluer avec la vraie liste des demandes. Le reste de la page
    // continue d'être vérifié normalement par axe.
    expect(await axe(container, { rules: { "heading-order": { enabled: false } } })).toHaveNoViolations();
  });

  it("redirige un SIEGE connecté vers /siege", async () => {
    seedSession("SIEGE");
    renderAppRouter();

    expect(await screen.findByRole("heading", { name: /Demandes à traiter/ })).toBeInTheDocument();
  });

  it("une route inconnue redirige aussi vers l'espace du rôle connecté", async () => {
    seedSession("DISTRIBUTEUR");
    irVers("/une-route-qui-n-existe-pas");
    renderAppRouter();

    expect(await screen.findByRole("heading", { name: /Mes demandes/ })).toBeInTheDocument();
  });
});

describe("AppRouter — logo et déconnexion", () => {
  beforeEach(() => {
    irVers("/");
  });

  it("le clic sur le logo reste sur l'espace du DISTRIBUTEUR connecté (pas /login)", async () => {
    const user = userEvent.setup();
    seedSession("DISTRIBUTEUR");
    irVers("/distributeur");
    renderAppRouter();
    await screen.findByRole("heading", { name: /Mes demandes/ });

    await user.click(screen.getByRole("link", { name: "AXA" }));

    expect(await screen.findByRole("heading", { name: /Mes demandes/ })).toBeInTheDocument();
  });

  it("le clic sur le logo reste sur l'espace du SIEGE connecté (pas /login)", async () => {
    const user = userEvent.setup();
    seedSession("SIEGE");
    irVers("/siege");
    renderAppRouter();
    await screen.findByRole("heading", { name: /Demandes à traiter/ });

    await user.click(screen.getByRole("link", { name: "AXA" }));

    expect(await screen.findByRole("heading", { name: /Demandes à traiter/ })).toBeInTheDocument();
  });

  it("la déconnexion ramène vers la page de connexion", async () => {
    const user = userEvent.setup();
    seedSession("DISTRIBUTEUR");
    irVers("/distributeur");
    renderAppRouter();
    await screen.findByRole("heading", { name: /Mes demandes/ });

    await user.click(screen.getByRole("button", { name: "Déconnexion" }));

    expect(await screen.findByRole("heading", { name: "Connexion", level: 1 })).toBeInTheDocument();
    expect(localStorage.getItem("access_token")).toBeNull();
  });
});
