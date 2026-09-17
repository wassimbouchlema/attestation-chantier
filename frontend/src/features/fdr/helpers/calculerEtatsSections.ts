import { CHAMPS_PAR_SECTION, ORDRE_SECTIONS, type SectionId } from "../constants/sections";
import { fdrInformationsSchema } from "../schemas/fdrInformationsSchema";
import type { FdrFormValues } from "../types/FdrFormValues";

export interface EtatsSectionsDerives {
  /** Sections dont les valeurs actuelles sont réellement valides (schéma complet, y compris les règles croisées). */
  sectionsValides: SectionId[];
  /** Première section (dans l'ordre métier) contenant un champ invalide, ou `null` si tout est valide. */
  premiereSectionInvalide: SectionId | null;
}

/**
 * Dérive l'état validated/locked des 5 sections directement des données du
 * formulaire, en réutilisant le schéma Zod existant (`safeParse`, jamais
 * `trigger()`) — aucune règle métier n'est dupliquée, et aucune erreur de
 * champ n'est écrite dans `formState` par cet appel : purement une lecture,
 * utilisable aussi bien à l'hydratation initiale (avant toute interaction)
 * qu'après une validation locale, sans jamais afficher de messages d'erreur
 * prématurés sur des sections que l'utilisateur n'a pas encore ouvertes.
 */
export const calculerEtatsSections = (valeurs: FdrFormValues): EtatsSectionsDerives => {
  const resultat = fdrInformationsSchema.safeParse(valeurs);
  if (resultat.success) {
    return { sectionsValides: [...ORDRE_SECTIONS], premiereSectionInvalide: null };
  }

  const champsEnErreur = new Set(resultat.error.issues.map((issue) => issue.path[0]));
  const sectionsInvalides = new Set(
    ORDRE_SECTIONS.filter((section) => CHAMPS_PAR_SECTION[section].some((champ) => champsEnErreur.has(champ))),
  );

  return {
    sectionsValides: ORDRE_SECTIONS.filter((section) => !sectionsInvalides.has(section)),
    premiereSectionInvalide: ORDRE_SECTIONS.find((section) => sectionsInvalides.has(section)) ?? null,
  };
};
