import { describe, expect, it } from "vitest";

import type { ChampExtractibleFdr, ResultatExtractionFdrApi } from "../../api/extraction";
import { depuisResultatExtraction } from "../../features/fdr/helpers/depuisResultatExtraction";

const TOUS_LES_CHAMPS: ChampExtractibleFdr[] = [
  "assure_nom",
  "assure_ville",
  "assure_numero_contrat",
  "chantier_nom",
  "chantier_ville",
  "type_chantier",
  "usage",
  "usage_autre_texte",
  "date_debut",
  "date_fin",
  "montant_total",
  "intervention_description",
  "intervention_montant_prestation",
  "intervention_type",
];

const resultatVide = (): ResultatExtractionFdrApi => ({
  assure_nom: null,
  assure_ville: null,
  assure_numero_contrat: null,
  chantier_nom: null,
  chantier_ville: null,
  type_chantier: null,
  usage: null,
  usage_autre_texte: null,
  date_debut: null,
  date_fin: null,
  montant_total: null,
  intervention_description: null,
  intervention_montant_prestation: null,
  intervention_type: null,
  champs_non_trouves: TOUS_LES_CHAMPS,
});

describe("depuisResultatExtraction", () => {
  it("laisse un champ texte inchangé", () => {
    const resultat = resultatVide();
    resultat.assure_nom = { valeur: "Jean Dupont", confiance: 0.92, page: 1, extrait_source: "Assuré : Jean Dupont" };

    const [champ] = depuisResultatExtraction(resultat);

    expect(champ).toEqual({
      champ: "assure_nom",
      valeurFormulaire: "Jean Dupont",
      confiance: 0.92,
      page: 1,
      extraitSource: "Assuré : Jean Dupont",
    });
  });

  it("laisse une date ISO inchangée", () => {
    const resultat = resultatVide();
    resultat.date_debut = { valeur: "2026-01-05", confiance: 0.8, page: null, extrait_source: null };

    const [champ] = depuisResultatExtraction(resultat);

    expect(champ.valeurFormulaire).toBe("2026-01-05");
  });

  it("laisse un enum inchangé", () => {
    const resultat = resultatVide();
    resultat.type_chantier = { valeur: "NEUVE", confiance: 0.75, page: null, extrait_source: null };
    resultat.usage = { valeur: "HABITATION", confiance: 0.75, page: null, extrait_source: null };
    resultat.intervention_type = { valeur: "PRINCIPALE", confiance: 0.75, page: null, extrait_source: null };

    const champs = depuisResultatExtraction(resultat);

    expect(champs.find((c) => c.champ === "type_chantier")?.valeurFormulaire).toBe("NEUVE");
    expect(champs.find((c) => c.champ === "usage")?.valeurFormulaire).toBe("HABITATION");
    expect(champs.find((c) => c.champ === "intervention_type")?.valeurFormulaire).toBe("PRINCIPALE");
  });

  it("convertit un montant number en chaîne", () => {
    const resultat = resultatVide();
    resultat.montant_total = { valeur: 140000.5, confiance: 0.6, page: 2, extrait_source: "Total : 140 000,50 €" };
    resultat.intervention_montant_prestation = { valeur: 1410, confiance: 0.6, page: null, extrait_source: null };

    const champs = depuisResultatExtraction(resultat);

    expect(champs.find((c) => c.champ === "montant_total")?.valeurFormulaire).toBe("140000.5");
    expect(champs.find((c) => c.champ === "intervention_montant_prestation")?.valeurFormulaire).toBe("1410");
  });

  it("ignore les champs null", () => {
    const resultat = resultatVide();
    resultat.chantier_nom = { valeur: "Tour Horizon", confiance: 0.6, page: null, extrait_source: null };

    const champs = depuisResultatExtraction(resultat);

    expect(champs).toHaveLength(1);
    expect(champs[0].champ).toBe("chantier_nom");
  });

  it("conserve les métadonnées confiance/page/extrait_source", () => {
    const resultat = resultatVide();
    resultat.chantier_ville = { valeur: "Lyon", confiance: 0.42, page: 3, extrait_source: "Chantier situé à Lyon" };

    const [champ] = depuisResultatExtraction(resultat);

    expect(champ.confiance).toBe(0.42);
    expect(champ.page).toBe(3);
    expect(champ.extraitSource).toBe("Chantier situé à Lyon");
  });

  it("ne produit jamais un champ métier non extractible", () => {
    const resultat = resultatVide();
    for (const champ of TOUS_LES_CHAMPS) {
      (resultat as unknown as Record<string, unknown>)[champ] = { valeur: "x", confiance: 0.5, page: null, extrait_source: null };
    }
    resultat.champs_non_trouves = [];

    const champs = depuisResultatExtraction(resultat);
    const nomsChamps = champs.map((c) => c.champ);

    expect(nomsChamps.sort()).toEqual([...TOUS_LES_CHAMPS].sort());
    expect(nomsChamps).not.toContain("modification_structure");
    expect(nomsChamps).not.toContain("chantier_atypique");
    expect(nomsChamps).not.toContain("activite_couverte");
    expect(nomsChamps).not.toContain("activite_non_couverte_texte");
    expect(nomsChamps).not.toContain("travaux_standards");
  });
});
