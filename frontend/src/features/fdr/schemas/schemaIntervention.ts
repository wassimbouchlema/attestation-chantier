import { z } from "zod";

/**
 * Brique de composition : forme des champs de la section Intervention.
 * "montant prestation < montant_total" est une règle croisée avec la
 * section Usage & calendrier : portée par le superRefine unique de
 * `fdrInformationsSchema`, pas ici.
 */
export const schemaIntervention = z.object({
  intervention_description: z.string().trim().min(1, "La description de l'intervention est obligatoire."),
  intervention_montant_prestation: z
    .string()
    .min(1, "Le montant de la prestation est obligatoire.")
    .refine((valeur) => !Number.isNaN(Number(valeur)), { message: "Le montant de la prestation doit être un nombre." })
    .refine((valeur) => Number(valeur) >= 0, { message: "Le montant de la prestation doit être positif ou nul." }),
  intervention_type: z
    .enum(["", "PRINCIPALE", "SOUS_TRAITANT"])
    .refine((valeur) => valeur !== "", { message: "Le type d'intervention est obligatoire." }),
});
