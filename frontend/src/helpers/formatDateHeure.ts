const FORMATEUR_DATE = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
const FORMATEUR_HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

export const formatDateHeure = (iso: string): string => {
  const date = new Date(iso);
  return `${FORMATEUR_DATE.format(date)} à ${FORMATEUR_HEURE.format(date)}`;
};
