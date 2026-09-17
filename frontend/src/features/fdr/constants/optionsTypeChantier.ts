import type { TypeChantier } from "../../../api/demandes";

export const OPTIONS_TYPE_CHANTIER: { value: TypeChantier; label: string }[] = [
  { value: "", label: "Sélectionner…" },
  { value: "NEUVE", label: "Construction neuve" },
  { value: "RENOVATION", label: "Rénovation" },
];
