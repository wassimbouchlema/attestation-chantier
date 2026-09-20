import { describe, expect, it } from "vitest";

import { formaterValeurCoherence } from "../../features/attestation/helpers/formaterValeurCoherence";

const espacesNormalises = (texte: string) => texte.replace(/[  ]/g, " ");

describe("formaterValeurCoherence", () => {
  it("formate les montants en euros à la française", () => {
    expect(espacesNormalises(formaterValeurCoherence("montant_total", "140000.00"))).toBe("140 000,00 €");
    expect(espacesNormalises(formaterValeurCoherence("intervention_montant_prestation", "1410,00"))).toBe("1 410,00 €");
  });

  it("laisse intacts les valeurs non numériques et les autres champs", () => {
    expect(formaterValeurCoherence("montant_total", "environ 1 000")).toBe("environ 1 000");
    expect(formaterValeurCoherence("montant_total", "")).toBe("");
    expect(formaterValeurCoherence("date_fin", "2027-06-30")).toBe("2027-06-30");
  });
});
