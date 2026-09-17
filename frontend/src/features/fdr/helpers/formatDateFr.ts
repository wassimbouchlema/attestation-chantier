/**
 * Formate une date ISO ("YYYY-MM-DD", valeur native d'un <input type="date">)
 * en "JJ/MM/AAAA" par découpage de chaîne plutôt que via `Date` : évite tout
 * risque de décalage de fuseau horaire (une date sans heure interprétée en
 * UTC minuit peut afficher le jour précédent/suivant selon le fuseau local).
 */
export const formatDateFr = (dateIso: string): string => {
  const [annee, mois, jour] = dateIso.split("-");
  return `${jour}/${mois}/${annee}`;
};
