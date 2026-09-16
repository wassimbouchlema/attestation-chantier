import type { StatutDemande } from "../../../api/demandes";

export const OPTIONS_STATUT: { value: StatutDemande | ""; label: string }[] = [
  { value: "", label: "Tous les statuts" },
  { value: "BROUILLON", label: "Brouillon" },
  { value: "EN_COURS", label: "En cours" },
  { value: "TRAITE", label: "Traité" },
];
