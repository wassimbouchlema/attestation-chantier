import { z } from "zod";

/** Brique de composition : forme des champs de la section Assuré uniquement. Composée dans `fdrInformationsSchema`, pas un resolver indépendant. */
export const schemaAssure = z.object({
  assure_nom: z.string().trim().min(1, "Le nom de l'assuré est obligatoire."),
  assure_ville: z.string().trim().min(1, "La ville est obligatoire."),
  assure_numero_contrat: z
    .string()
    .trim()
    .min(1, "Le numéro de contrat est obligatoire.")
    .regex(/^\d{1,13}$/, "Le numéro de contrat doit être uniquement numérique (13 chiffres maximum)."),
});
