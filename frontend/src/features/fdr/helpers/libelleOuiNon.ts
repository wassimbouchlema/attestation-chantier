/** Formatte un booléen tri-state pour l'affichage en restitution. */
export const libelleOuiNon = (valeur: boolean | null): string =>
  valeur === true ? "Oui" : valeur === false ? "Non" : "—";
