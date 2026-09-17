import { z } from "zod";

import { schemaAssure } from "./schemaAssure";
import { schemaChantier } from "./schemaChantier";
import { schemaIntervention } from "./schemaIntervention";
import { schemaQuestionsMetier } from "./schemaQuestionsMetier";
import { schemaUsageCalendrier } from "./schemaUsageCalendrier";

/**
 * Schéma final unique de l'étape Informations, seul resolver passé à
 * useForm. Les schémas de section ne sont que des briques de composition
 * (forme + règles par-champ) ; toutes les règles conditionnelles/croisées
 * vivent ici, dans un unique superRefine, car certaines dépendent de champs
 * de sections différentes (ex. prestation < montant_total). `trigger([...])`
 * continue de ne bloquer que sur les champs demandés même si le schéma
 * entier est réévalué à chaque appel (comportement documenté de RHF avec
 * resolver).
 */
export const fdrInformationsSchema = z
  .object({
    ...schemaAssure.shape,
    ...schemaChantier.shape,
    ...schemaUsageCalendrier.shape,
    ...schemaIntervention.shape,
    ...schemaQuestionsMetier.shape,
  })
  .superRefine((valeurs, ctx) => {
    // Chantier : modification_structure obligatoire uniquement en rénovation.
    if (valeurs.type_chantier === "RENOVATION" && valeurs.modification_structure === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["modification_structure"],
        message: "Merci d'indiquer si le chantier implique une modification de structure.",
      });
    }

    // Usage & calendrier
    if (valeurs.usage === "AUTRE" && valeurs.usage_autre_texte.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["usage_autre_texte"],
        message: 'Une précision est nécessaire lorsque l\'usage est "Autre".',
      });
    }
    if (valeurs.date_debut && valeurs.date_fin && valeurs.date_fin <= valeurs.date_debut) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["date_fin"],
        message: "La date de fin doit être strictement postérieure à la date de début.",
      });
    }

    // Intervention (règle croisée avec Usage & calendrier)
    const montantTotal = Number(valeurs.montant_total);
    const montantPrestation = Number(valeurs.intervention_montant_prestation);
    if (
      valeurs.montant_total !== "" &&
      valeurs.intervention_montant_prestation !== "" &&
      !Number.isNaN(montantTotal) &&
      !Number.isNaN(montantPrestation) &&
      montantPrestation >= montantTotal
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["intervention_montant_prestation"],
        message: "Le montant de la prestation doit être strictement inférieur au montant total.",
      });
    }

    // Questions métier
    if (valeurs.activite_couverte === false && valeurs.activite_non_couverte_texte.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["activite_non_couverte_texte"],
        message: "Une explication est nécessaire lorsque l'activité n'est pas couverte par le contrat.",
      });
    }
  });

export type FdrInformationsSchema = z.infer<typeof fdrInformationsSchema>;
