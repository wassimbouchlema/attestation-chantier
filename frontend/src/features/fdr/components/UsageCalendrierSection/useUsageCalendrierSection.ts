import { useEffect, useRef } from "react";

import { useFormContext } from "react-hook-form";

import { OPTIONS_USAGE } from "../../constants/optionsUsage";
import { CHAMPS_USAGE_CALENDRIER } from "../../constants/sections";
import { formatDateFr } from "../../helpers/formatDateFr";
import { formatMontant } from "../../helpers/formatMontant";
import type { FdrFormValues } from "../../types/FdrFormValues";

/** Orchestration RHF de la section Usage & calendrier : validation locale, focus, nettoyage conditionnel, valeurs de restitution. */
export const useUsageCalendrierSection = (onValide: () => void) => {
  const {
    register,
    control,
    trigger,
    watch,
    setValue,
    setFocus,
    formState: { errors },
  } = useFormContext<FdrFormValues>();

  const usage = watch("usage");
  const usageEstAutre = usage === "AUTRE";

  // Ne nettoie que sur un changement RÉEL d'usage (vs sa valeur précédente) :
  // au montage, ce watch peut encore valoir "" (avant le reset() d'hydratation
  // du parent), et StrictMode rejoue cet effet avec cette même valeur — une
  // garde "ignorer le premier rendu" ne suffirait pas.
  const usagePrecedentRef = useRef(usage);
  useEffect(() => {
    const precedent = usagePrecedentRef.current;
    usagePrecedentRef.current = usage;
    if (precedent === usage) {
      return;
    }
    if (usage !== "AUTRE") {
      setValue("usage_autre_texte", "");
    }
  }, [usage, setValue]);

  const valider = async () => {
    const estValide = await trigger(CHAMPS_USAGE_CALENDRIER);
    if (estValide) {
      onValide();
      return;
    }
    const premierChampInvalide = CHAMPS_USAGE_CALENDRIER.find((champ) => errors[champ]);
    if (premierChampInvalide) {
      setFocus(premierChampInvalide);
    }
  };

  const [usageValeur, usageAutreTexte, dateDebut, dateFin, montantTotal] = watch([
    "usage",
    "usage_autre_texte",
    "date_debut",
    "date_fin",
    "montant_total",
  ]);

  return {
    register,
    control,
    errors,
    valider,
    usageEstAutre,
    usageLabel: OPTIONS_USAGE.find((option) => option.value === usageValeur)?.label,
    usageAutreTexte,
    datesLabel: `Du ${formatDateFr(dateDebut)} au ${formatDateFr(dateFin)}`,
    montantTotalLabel: formatMontant(montantTotal),
  };
};
