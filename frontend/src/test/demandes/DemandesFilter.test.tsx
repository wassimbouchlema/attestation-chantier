import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DemandesFilter } from "../../features/demandes/components/DemandesFilter/DemandesFilter";

describe("DemandesFilter", () => {
  it("propose uniquement les 4 statuts réels, sans placeholder « - Select - » injecté par Canopée", () => {
    render(<DemandesFilter statut="" onChange={() => {}} />);

    const select = screen.getByLabelText("Statut") as HTMLSelectElement;
    const optionsTexte = Array.from(select.options).map((option) => option.textContent);

    expect(optionsTexte).toEqual(["Tous les statuts", "Brouillon", "En cours", "Traité"]);
  });

  it("n'affiche pas le champ comme obligatoire (pas de required, pas de classe déclenchant l'astérisque CSS)", () => {
    render(<DemandesFilter statut="" onChange={() => {}} />);

    expect(screen.getByLabelText("Statut")).not.toBeRequired();
    expect(screen.getByText("Statut")).not.toHaveClass("af-form__group-label--required");
  });

  it("notifie le statut sélectionné", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<DemandesFilter statut="" onChange={handleChange} />);

    await user.selectOptions(screen.getByLabelText("Statut"), "Brouillon");

    expect(handleChange).toHaveBeenCalledWith("BROUILLON");
  });
});
