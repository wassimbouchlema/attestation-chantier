import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { VilleField } from "../../features/fdr/components/VilleField/VilleField";
import type { FdrFormValues } from "../../features/fdr/types/FdrFormValues";
import { server } from "../server";

const Harnais = ({ initiale = "" }: { initiale?: string }) => {
  const methods = useForm<FdrFormValues>({ defaultValues: { assure_ville: initiale } });
  const ville = useWatch({ control: methods.control, name: "assure_ville" });
  return (
    <FormProvider {...methods}>
      <VilleField name="assure_ville" label="Ville" />
      <output data-testid="valeur-fdr">{ville}</output>
    </FormProvider>
  );
};

const valeurFdr = () => screen.getByTestId("valeur-fdr").textContent;

describe("VilleField — suggestions geo.api.gouv.fr", () => {
  it("n'appelle pas l'API sous le seuil de 2 caractères, puis recherche après le debounce", async () => {
    const appels: string[] = [];
    server.use(
      http.get("https://geo.api.gouv.fr/communes", ({ request }) => {
        appels.push(new URL(request.url).searchParams.get("nom") ?? "");
        return HttpResponse.json([{ nom: "Paris", codesPostaux: ["75001"] }]);
      }),
    );
    const user = userEvent.setup();
    render(<Harnais />);

    await user.type(screen.getByLabelText("Ville"), "P");
    expect(await screen.findByText("Saisissez au moins 2 caractères")).toBeInTheDocument();
    expect(appels).toEqual([]);

    await user.type(screen.getByLabelText("Ville"), "a");
    expect(await screen.findByRole("option", { name: "Paris (75001)" })).toBeInTheDocument();
    expect(appels).toEqual(["Pa"]);
  });

  it("regroupe une saisie rapide en une seule requête (debounce)", async () => {
    const appels: string[] = [];
    server.use(
      http.get("https://geo.api.gouv.fr/communes", ({ request }) => {
        appels.push(new URL(request.url).searchParams.get("nom") ?? "");
        return HttpResponse.json([{ nom: "Lyon", codesPostaux: ["69001"] }]);
      }),
    );
    const user = userEvent.setup();
    render(<Harnais />);

    await user.type(screen.getByLabelText("Ville"), "Lyon");
    await screen.findByRole("option", { name: "Lyon (69001)" });

    expect(appels).toEqual(["Lyon"]);
  });

  it("affiche nom + code postal, limite les résultats demandés et stocke uniquement le nom à la sélection", async () => {
    let limite: string | null = null;
    server.use(
      http.get("https://geo.api.gouv.fr/communes", ({ request }) => {
        limite = new URL(request.url).searchParams.get("limit");
        return HttpResponse.json([
          { nom: "Saint-Denis", codesPostaux: ["93200"] },
          { nom: "Saint-Denis", codesPostaux: ["97400"] },
        ]);
      }),
    );
    const user = userEvent.setup();
    render(<Harnais />);

    await user.type(screen.getByLabelText("Ville"), "Saint");
    expect(await screen.findByRole("option", { name: "Saint-Denis (93200)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Saint-Denis (97400)" })).toBeInTheDocument();
    expect(Number(limite)).toBeLessThanOrEqual(10);

    await user.click(screen.getByRole("option", { name: "Saint-Denis (97400)" }));

    expect(valeurFdr()).toBe("Saint-Denis");
    expect(screen.getByText("Saint-Denis (97400)")).toBeInTheDocument();
  });

  it("permet la sélection au clavier", async () => {
    const user = userEvent.setup();
    render(<Harnais />);

    await user.type(screen.getByLabelText("Ville"), "Lyon");
    await screen.findByRole("option", { name: "Lyon (69001)" });
    await user.keyboard("{ArrowDown}{Enter}");

    expect(valeurFdr()).toBe("Lyon");
  });

  it("affiche un message quand aucune commune ne correspond", async () => {
    server.use(http.get("https://geo.api.gouv.fr/communes", () => HttpResponse.json([])));
    const user = userEvent.setup();
    render(<Harnais />);

    await user.type(screen.getByLabelText("Ville"), "Zzzz");

    expect(await screen.findByText("Aucune commune trouvée pour « Zzzz »")).toBeInTheDocument();
    expect(valeurFdr()).toBe("");
  });

  it("affiche l'état de chargement pendant la recherche", async () => {
    server.use(
      http.get("https://geo.api.gouv.fr/communes", async () => {
        await delay(400);
        return HttpResponse.json([{ nom: "Paris", codesPostaux: ["75001"] }]);
      }),
    );
    const user = userEvent.setup();
    render(<Harnais />);

    await user.type(screen.getByLabelText("Ville"), "Paris");

    expect(await screen.findByText("Recherche en cours…")).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Paris (75001)" })).toBeInTheDocument();
  });

  it("gère une erreur réseau sans planter : repli sur la saisie libre", async () => {
    server.use(http.get("https://geo.api.gouv.fr/communes", () => HttpResponse.error()));
    const erreurConsole = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<Harnais />);

    await user.type(screen.getByLabelText("Ville"), "Bourg");
    const repli = await screen.findByRole("option", { name: "Suggestions indisponibles : utiliser « Bourg »" });
    await user.click(repli);

    expect(valeurFdr()).toBe("Bourg");
    expect(screen.getByText("Bourg", { selector: "[class*=singleValue]" })).toBeInTheDocument();
    erreurConsole.mockRestore();
  });

  it("affiche la ville déjà enregistrée et permet de l'effacer", async () => {
    const user = userEvent.setup();
    render(<Harnais initiale="Paris" />);

    expect(screen.getByText("Paris", { selector: "[class*=singleValue]" })).toBeInTheDocument();
    await user.click(screen.getByLabelText("Ville"));
    await user.keyboard("{Backspace}");

    expect(valeurFdr()).toBe("");
  });
});
