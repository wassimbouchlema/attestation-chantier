import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import type { ReportingApi } from "../../api/reporting";
import { AuthProvider } from "../../features/auth/AuthProvider";
import { ReportingSynthese } from "../../features/reporting/components/ReportingSynthese/ReportingSynthese";
import { createQueryClient } from "../../queryClient";
import { server } from "../server";
import { seedSession } from "../utils";

const renderSynthese = (inclureBrouillons = false) =>
  render(
    <AuthProvider>
      <QueryClientProvider client={createQueryClient()}>
        <ReportingSynthese inclureBrouillons={inclureBrouillons} />
      </QueryClientProvider>
    </AuthProvider>,
  );

const repondre = (reponse: ReportingApi) => server.use(http.get("*/reporting/", () => HttpResponse.json(reponse)));

const valeurDe = (libelle: string) => {
  const terme = screen.getByText(libelle, { selector: "dt" });
  return within(terme.parentElement as HTMLElement).getByRole("definition").textContent;
};

const attendreValeurs = () => waitFor(() => expect(valeurDe("Demandes")).not.toBe("–"));

const legende = () => within(screen.getByRole("list", { name: "Répartition des demandes" }));

describe("ReportingSynthese", () => {
  beforeEach(() => {
    seedSession("DISTRIBUTEUR");
  });

  it("affiche le titre et les quatre indicateurs renvoyés par le serveur", async () => {
    repondre({ total: 10, brouillons: 0, en_cours: 4, acceptees: 5, refusees: 1 });
    renderSynthese();

    expect(screen.getByRole("region", { name: "Synthèse des demandes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Synthèse des demandes" })).toBeInTheDocument();
    await attendreValeurs();
    expect(valeurDe("Demandes")).toBe("10");
    expect(valeurDe("En cours")).toBe("4");
    expect(valeurDe("Acceptées")).toBe("5");
    expect(valeurDe("Refusées")).toBe("1");
  });

  it("distributeur : la légende inclut les brouillons fournis par l'API", async () => {
    repondre({ total: 8, brouillons: 2, en_cours: 2, acceptees: 3, refusees: 1 });
    renderSynthese(true);

    await attendreValeurs();
    expect(valeurDe("Demandes")).toBe("8");
    const items = legende().getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(["Brouillons : 2", "En cours : 2", "Acceptées : 3", "Refusées : 1"]);
  });

  it("siège : la légende ne présente jamais les brouillons", async () => {
    repondre({ total: 6, brouillons: 0, en_cours: 2, acceptees: 3, refusees: 1 });
    renderSynthese(false);

    await attendreValeurs();
    const items = legende().getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(["En cours : 2", "Acceptées : 3", "Refusées : 1"]);
  });

  it("masque les segments à 0 dans la barre décorative mais les garde dans la légende", async () => {
    repondre({ total: 5, brouillons: 0, en_cours: 2, acceptees: 3, refusees: 0 });
    const { container } = renderSynthese(true);

    await attendreValeurs();
    const barre = container.querySelector(".reporting-synthese__barre") as HTMLElement;
    expect(barre).toHaveAttribute("aria-hidden", "true");
    expect(barre.children).toHaveLength(2);
    expect(legende().getAllByRole("listitem")).toHaveLength(4);
    expect(legende().getByText("Refusées : 0")).toBeInTheDocument();
  });

  it("affiche les valeurs à 0 et « Aucune demande » sans barre ni légende", async () => {
    const { container } = renderSynthese(true);

    await attendreValeurs();
    for (const libelle of ["Demandes", "En cours", "Acceptées", "Refusées"]) {
      expect(valeurDe(libelle)).toBe("0");
    }
    expect(screen.getByText("Aucune demande")).toBeInTheDocument();
    expect(container.querySelector(".reporting-synthese__barre")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Répartition des demandes" })).not.toBeInTheDocument();
  });

  it("affiche une erreur puis permet de réessayer", async () => {
    const user = userEvent.setup();
    server.use(http.get("*/reporting/", () => new HttpResponse(null, { status: 500 })));
    renderSynthese();

    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de charger la synthèse des demandes.");

    repondre({ total: 2, brouillons: 0, en_cours: 1, acceptees: 1, refusees: 0 });
    await user.click(screen.getByRole("button", { name: "Réessayer" }));

    await attendreValeurs();
    expect(valeurDe("Demandes")).toBe("2");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ne présente pas de violation d'accessibilité détectable (axe)", async () => {
    repondre({ total: 4, brouillons: 1, en_cours: 1, acceptees: 1, refusees: 1 });
    const { container } = renderSynthese(true);

    await attendreValeurs();
    expect(await axe(container)).toHaveNoViolations();
  });
});
