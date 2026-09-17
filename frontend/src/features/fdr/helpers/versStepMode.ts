import type { EtatSection } from "../types/EtatSection";

/**
 * VerticalStepMode ("edited" | "locked" | "validated") n'est pas exporté
 * publiquement par @axa-fr/canopee-react (seul le composant VerticalStep
 * l'est) — le type ci-dessous reproduit exactement l'union réelle du
 * composant (vérifiée dans Steps/types.d.ts), pour garder cette
 * correspondance à un seul endroit plutôt que de la dupliquer par section.
 */
type VerticalStepMode = "edited" | "locked" | "validated";

const CORRESPONDANCE: Record<EtatSection, VerticalStepMode> = {
  active: "edited",
  validee: "validated",
  a_venir: "locked",
};

export const versStepMode = (etat: EtatSection): VerticalStepMode => CORRESPONDANCE[etat];
