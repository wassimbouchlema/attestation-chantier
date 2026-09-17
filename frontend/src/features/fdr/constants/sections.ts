import type { FdrFormValues } from "../types/FdrFormValues";

/**
 * Découpage des 5 sections de l'étape Informations, partagé entre chaque
 * section (son propre `trigger(CHAMPS_X)`) et `FdrInformationsPage` (pour
 * localiser, après un `trigger()` global en échec, la première section
 * contenant un champ en erreur — ex. une incohérence croisée révélée
 * seulement après modification d'une section précédente déjà validée).
 * Centralisé ici pour n'avoir qu'une seule liste par section, jamais deux
 * qui pourraient diverger.
 */
export const ORDRE_SECTIONS = ["assure", "chantier", "usage", "intervention", "questions"] as const;
export type SectionId = (typeof ORDRE_SECTIONS)[number];

export const CHAMPS_ASSURE = ["assure_nom", "assure_ville", "assure_numero_contrat"] as const;
export const CHAMPS_CHANTIER = [
  "chantier_nom",
  "chantier_ville",
  "type_chantier",
  "modification_structure",
  "chantier_atypique",
] as const;
export const CHAMPS_USAGE_CALENDRIER = ["usage", "usage_autre_texte", "date_debut", "date_fin", "montant_total"] as const;
export const CHAMPS_INTERVENTION = [
  "intervention_description",
  "intervention_montant_prestation",
  "intervention_type",
] as const;
export const CHAMPS_QUESTIONS_METIER = ["activite_couverte", "activite_non_couverte_texte", "travaux_standards"] as const;

export const CHAMPS_PAR_SECTION: Record<SectionId, readonly (keyof FdrFormValues)[]> = {
  assure: CHAMPS_ASSURE,
  chantier: CHAMPS_CHANTIER,
  usage: CHAMPS_USAGE_CALENDRIER,
  intervention: CHAMPS_INTERVENTION,
  questions: CHAMPS_QUESTIONS_METIER,
};
