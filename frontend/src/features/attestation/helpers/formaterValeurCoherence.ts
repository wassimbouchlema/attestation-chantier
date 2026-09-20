import { formatMontant } from "../../fdr/helpers/formatMontant";

const CHAMPS_MONTANT = new Set(["montant_total", "intervention_montant_prestation"]);

export const formaterValeurCoherence = (champ: string, valeur: string): string => {
  if (!CHAMPS_MONTANT.has(champ)) return valeur;
  const normalisee = valeur.replace(/\s/g, "").replace(",", ".");
  return normalisee !== "" && Number.isFinite(Number(normalisee)) ? formatMontant(normalisee) : valeur;
};
