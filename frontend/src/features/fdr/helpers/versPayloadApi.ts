import type { FormulaireRisqueApi } from "../../../api/demandes";
import type { FdrFormValues } from "../types/FdrFormValues";

/**
 * RHF -> API, symétrique de `versFormValues`. Aucune règle métier
 * additionnelle : les normalisations conditionnelles (modification_structure
 * hors rénovation, textes de précision hors condition) sont déjà appliquées
 * en amont, en direct dans l'état RHF, par chaque section concernée
 * (ChantierSection/UsageCalendrierSection/QuestionsMetierSection, via
 * `setValue(..., "" | null)` dans un `useEffect`) — ce mapper se contente de
 * reporter les valeurs telles quelles. Seule conversion réelle : `""` (RHF,
 * `DateInput`/`NumberInput`) -> `null` (contrat API) pour les dates/montants.
 */
export const versPayloadApi = (values: FdrFormValues): FormulaireRisqueApi => ({
  assure_nom: values.assure_nom,
  assure_ville: values.assure_ville,
  assure_numero_contrat: values.assure_numero_contrat,
  chantier_nom: values.chantier_nom,
  chantier_ville: values.chantier_ville,
  type_chantier: values.type_chantier,
  modification_structure: values.modification_structure,
  chantier_atypique: values.chantier_atypique,
  usage: values.usage,
  usage_autre_texte: values.usage_autre_texte,
  date_debut: values.date_debut || null,
  date_fin: values.date_fin || null,
  montant_total: values.montant_total || null,
  intervention_description: values.intervention_description,
  intervention_montant_prestation: values.intervention_montant_prestation || null,
  intervention_type: values.intervention_type,
  activite_couverte: values.activite_couverte,
  activite_non_couverte_texte: values.activite_non_couverte_texte,
  travaux_standards: values.travaux_standards,
});
