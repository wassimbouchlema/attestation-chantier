import { z } from "zod";

import { MESSAGE_NOM, MESSAGE_NUMERO_CONTRAT, REGEX_NOM, REGEX_NUMERO_CONTRAT } from "./reglesTexte";

/** Brique de composition : forme des champs de la section Assuré uniquement. Composée dans `fdrInformationsSchema`, pas un resolver indépendant. */
export const schemaAssure = z.object({
  assure_nom: z.string().trim().min(1, "Le nom de l'assuré est obligatoire.").regex(REGEX_NOM, MESSAGE_NOM),
  assure_ville: z.string().trim().min(1, "La ville est obligatoire."),
  assure_numero_contrat: z
    .string()
    .trim()
    .min(1, "Le numéro de contrat est obligatoire.")
    .regex(REGEX_NUMERO_CONTRAT, MESSAGE_NUMERO_CONTRAT),
});
