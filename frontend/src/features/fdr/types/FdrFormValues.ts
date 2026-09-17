import type { TypeChantier, TypeIntervention, UsageChantier } from "../../../api/demandes";

/**
 * Valeurs du formulaire Informations (React Hook Form). Contrairement à
 * `FormulaireRisqueApi`, les dates/montants restent des `string` (jamais
 * `null`) : `DateInput`/`NumberInput` de Canopée manipulent des chaînes
 * contrôlées, et `""` représente "non renseigné" côté formulaire. Les 4
 * booléens tri-state restent `boolean | null` à l'identique de l'API :
 * `null` ne devient jamais `false`.
 */
export interface FdrFormValues {
  assure_nom: string;
  assure_ville: string;
  assure_numero_contrat: string;
  chantier_nom: string;
  chantier_ville: string;
  type_chantier: TypeChantier;
  modification_structure: boolean | null;
  chantier_atypique: boolean | null;
  usage: UsageChantier;
  usage_autre_texte: string;
  date_debut: string;
  date_fin: string;
  montant_total: string;
  intervention_description: string;
  intervention_montant_prestation: string;
  intervention_type: TypeIntervention;
  activite_couverte: boolean | null;
  activite_non_couverte_texte: string;
  travaux_standards: boolean | null;
}

/** defaultValues initiales de useForm, avant toute hydratation depuis l'API. */
export const FDR_FORM_VALEURS_VIDES: FdrFormValues = {
  assure_nom: "",
  assure_ville: "",
  assure_numero_contrat: "",
  chantier_nom: "",
  chantier_ville: "",
  type_chantier: "",
  modification_structure: null,
  chantier_atypique: null,
  usage: "",
  usage_autre_texte: "",
  date_debut: "",
  date_fin: "",
  montant_total: "",
  intervention_description: "",
  intervention_montant_prestation: "",
  intervention_type: "",
  activite_couverte: null,
  activite_non_couverte_texte: "",
  travaux_standards: null,
};
