import type { DecisionDemande, FiltreComplements, FiltreDecision } from "../../../api/demandes";

export const OPTIONS_DECISION: { value: FiltreDecision | ""; label: string }[] = [
  { value: "", label: "Toutes les décisions" },
  { value: "ACCEPTEE", label: "Acceptée" },
  { value: "REFUSEE", label: "Refusée" },
  { value: "EN_ATTENTE", label: "En attente" },
];

export const LIBELLE_DECISION: Record<DecisionDemande, string> = {
  ACCEPTEE: "Acceptée",
  REFUSEE: "Refusée",
};

export const OPTIONS_COMPLEMENTS: { value: FiltreComplements | ""; label: string }[] = [
  { value: "", label: "Tous" },
  { value: "DEMANDES", label: "Compléments demandés" },
  { value: "AUCUN", label: "Aucun complément demandé" },
];
