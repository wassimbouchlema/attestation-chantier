const DELAI_RELANCE_MS = 24 * 60 * 60 * 1000;

/** Anticipation d'affichage uniquement (bouton désactivé, date annoncée) — le backend reste l'unique source de vérité pour l'autorisation réelle. */
export const calculerProchaineRelance = (lastRelanceAt: string): Date =>
  new Date(new Date(lastRelanceAt).getTime() + DELAI_RELANCE_MS);
