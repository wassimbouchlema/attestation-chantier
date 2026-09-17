import type { TypeIntervention } from "../../../api/demandes";

export const OPTIONS_INTERVENTION_TYPE: { value: TypeIntervention; label: string }[] = [
  { value: "", label: "Sélectionner…" },
  { value: "PRINCIPALE", label: "Entreprise principale" },
  { value: "SOUS_TRAITANT", label: "Sous-traitant" },
];
