import type { FormulaireRisqueApi } from "../../../api/demandes";
import type { FdrFormValues } from "../types/FdrFormValues";

/**
 * API -> RHF. Pas de règle générique "null -> valeur par défaut" : chaque
 * champ suit son propre contrat backend (voir FormulaireRisqueApi). Texte/
 * choix sont déjà `""` côté API, recopiés tels quels. Dates/montants
 * deviennent `""` uniquement parce que `null` API -> `""` RHF (compatibilité
 * DateInput/NumberInput). Les booléens tri-state restent `null` sans jamais
 * devenir `false`.
 */
export const versFormValues = (fdr: FormulaireRisqueApi): FdrFormValues => ({
  assure_nom: fdr.assure_nom,
  assure_ville: fdr.assure_ville,
  assure_numero_contrat: fdr.assure_numero_contrat,
  chantier_nom: fdr.chantier_nom,
  chantier_ville: fdr.chantier_ville,
  type_chantier: fdr.type_chantier,
  modification_structure: fdr.modification_structure,
  chantier_atypique: fdr.chantier_atypique,
  usage: fdr.usage,
  usage_autre_texte: fdr.usage_autre_texte,
  date_debut: fdr.date_debut ?? "",
  date_fin: fdr.date_fin ?? "",
  montant_total: fdr.montant_total ?? "",
  intervention_description: fdr.intervention_description,
  intervention_montant_prestation: fdr.intervention_montant_prestation ?? "",
  intervention_type: fdr.intervention_type,
  activite_couverte: fdr.activite_couverte,
  activite_non_couverte_texte: fdr.activite_non_couverte_texte,
  travaux_standards: fdr.travaux_standards,
});
