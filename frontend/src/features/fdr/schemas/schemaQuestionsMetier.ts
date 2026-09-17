import { z } from "zod";

/**
 * Brique de composition : forme des champs de la section Questions métier.
 * "activite_non_couverte_texte obligatoire si Non" est portée par le
 * superRefine unique de `fdrInformationsSchema`.
 */
export const schemaQuestionsMetier = z.object({
  activite_couverte: z
    .boolean()
    .nullable()
    .refine((valeur) => valeur !== null, { message: "Merci d'indiquer si l'activité est couverte par le contrat." }),
  activite_non_couverte_texte: z.string().trim(),
  travaux_standards: z
    .boolean()
    .nullable()
    .refine((valeur) => valeur !== null, { message: "Merci d'indiquer si les travaux sont standards." }),
});
