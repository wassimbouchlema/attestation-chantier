import type { ChampExtractibleFdr, ResultatExtractionFdrApi } from "../../../api/extraction";

/**
 * Un champ détecté, prêt à être proposé dans l'aperçu : la conversion vers
 * une valeur compatible `FdrFormValues` est faite ici, mais l'application au
 * formulaire (setValue, seuils, décisions UX) reste à la charge de l'UI.
 */
export interface ChampPreremplissageFdr {
  champ: ChampExtractibleFdr;
  valeurFormulaire: string;
  confiance: number;
  page: number | null;
  extraitSource: string | null;
}

const CHAMPS_EXTRACTIBLES: ChampExtractibleFdr[] = [
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

/**
 * `String(valeur)` suffit pour les 14 champs : les textes/dates ISO/enums
 * sont déjà des chaînes identiques à ce qu'attend `FdrFormValues`, et les
 * montants (seuls champs numériques du contrat) n'ont besoin que de cette
 * même conversion.
 */
export const depuisResultatExtraction = (resultat: ResultatExtractionFdrApi): ChampPreremplissageFdr[] => {
  const champsPreremplis: ChampPreremplissageFdr[] = [];
  for (const champ of CHAMPS_EXTRACTIBLES) {
    const champExtrait = resultat[champ];
    if (champExtrait === null) {
      continue;
    }
    champsPreremplis.push({
      champ,
      valeurFormulaire: String(champExtrait.valeur),
      confiance: champExtrait.confiance,
      page: champExtrait.page,
      extraitSource: champExtrait.extrait_source,
    });
  }
  return champsPreremplis;
};
