import { z } from "zod";

/**
 * Brique de composition : forme des champs de la section Chantier.
 * La règle conditionnelle "modification_structure obligatoire si
 * RENOVATION" est croisée avec type_chantier (même section) mais est portée
 * par le superRefine unique de `fdrInformationsSchema`, pas ici — ce fichier
 * ne décrit que la forme/les règles par-champ.
 */
export const schemaChantier = z.object({
  chantier_nom: z.string().trim().min(1, "Le nom du chantier est obligatoire."),
  chantier_ville: z.string().trim().min(1, "La ville du chantier est obligatoire."),
  type_chantier: z
    .enum(["", "NEUVE", "RENOVATION"])
    .refine((valeur) => valeur !== "", { message: "Le type de chantier est obligatoire." }),
  modification_structure: z.boolean().nullable(),
  chantier_atypique: z
    .boolean()
    .nullable()
    .refine((valeur) => valeur !== null, { message: "Merci d'indiquer si le chantier est atypique." }),
});
