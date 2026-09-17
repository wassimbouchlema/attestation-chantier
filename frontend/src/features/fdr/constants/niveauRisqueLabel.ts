import type { CardDataVariant } from "@axa-fr/canopee-react/distributeur";

import type { NiveauRisque } from "../../../api/evaluationRisque";

export const LIBELLE_NIVEAU_RISQUE: Record<NiveauRisque, string> = {
  faible: "Faible",
  modere: "Modéré",
  eleve: "Élevé",
};

export const VARIANT_NIVEAU_RISQUE: Record<NiveauRisque, CardDataVariant> = {
  faible: "success",
  modere: "warning",
  eleve: "error",
};
