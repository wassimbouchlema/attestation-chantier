const formateur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** `valeur` est la chaîne du formulaire (ex. "12500.5"), jamais convertie en `number` ailleurs que pour cet affichage. */
export const formatMontant = (valeur: string): string => formateur.format(Number(valeur));
