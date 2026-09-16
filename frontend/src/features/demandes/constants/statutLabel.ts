import type { TagVariants } from "@axa-fr/canopee-react/distributeur";

import type { StatutDemande } from "../../../api/demandes";

export const LIBELLE_STATUT: Record<StatutDemande, string> = {
  BROUILLON: "Brouillon",
  EN_COURS: "En cours",
  TRAITE: "Traité",
};

export const VARIANT_STATUT: Record<StatutDemande, TagVariants> = {
  BROUILLON: "default",
  EN_COURS: "information",
  TRAITE: "success",
};
