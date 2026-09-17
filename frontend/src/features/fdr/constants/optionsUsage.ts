import type { UsageChantier } from "../../../api/demandes";

export const OPTIONS_USAGE: { value: UsageChantier; label: string }[] = [
  { value: "", label: "Sélectionner…" },
  { value: "HABITATION", label: "Habitation" },
  { value: "BUREAU", label: "Bureau" },
  { value: "COMMERCE", label: "Commerce" },
  { value: "AUTRE", label: "Autre" },
];
