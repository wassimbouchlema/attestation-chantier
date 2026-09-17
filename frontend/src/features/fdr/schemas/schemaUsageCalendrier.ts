import { z } from "zod";

/**
 * Brique de composition : forme des champs de la section Usage & calendrier.
 * "usage_autre_texte obligatoire si AUTRE" et "date_fin > date_debut" sont
 * portées par le superRefine unique de `fdrInformationsSchema`.
 */
export const schemaUsageCalendrier = z.object({
  usage: z
    .enum(["", "HABITATION", "BUREAU", "COMMERCE", "AUTRE"])
    .refine((valeur) => valeur !== "", { message: "L'usage est obligatoire." }),
  usage_autre_texte: z.string().trim(),
  date_debut: z.string().min(1, "La date de début est obligatoire."),
  date_fin: z.string().min(1, "La date de fin est obligatoire."),
  montant_total: z
    .string()
    .min(1, "Le montant total est obligatoire.")
    .refine((valeur) => !Number.isNaN(Number(valeur)), { message: "Le montant total doit être un nombre." })
    .refine((valeur) => Number(valeur) >= 0, { message: "Le montant total doit être positif ou nul." }),
});
