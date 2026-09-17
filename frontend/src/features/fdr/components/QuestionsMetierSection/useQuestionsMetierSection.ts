import { useEffect, useRef } from "react";

import { useFormContext } from "react-hook-form";

import { CHAMPS_QUESTIONS_METIER } from "../../constants/sections";
import { libelleOuiNon } from "../../helpers/libelleOuiNon";
import type { FdrFormValues } from "../../types/FdrFormValues";

/** Orchestration RHF de la section Questions métier : validation locale, focus, nettoyage conditionnel, valeurs de restitution. */
export const useQuestionsMetierSection = (onValide: () => void) => {
  const {
    register,
    control,
    trigger,
    watch,
    setValue,
    setFocus,
    formState: { errors },
  } = useFormContext<FdrFormValues>();

  const activiteCouverte = watch("activite_couverte");
  const activiteNonCouverte = activiteCouverte === false;

  // Ne nettoie que sur un changement RÉEL d'activite_couverte (vs sa valeur
  // précédente) : au montage, ce watch peut encore valoir null (avant le
  // reset() d'hydratation du parent), et StrictMode rejoue cet effet avec
  // cette même valeur — une garde "ignorer le premier rendu" ne suffirait pas.
  const activiteCouvertePrecedenteRef = useRef(activiteCouverte);
  useEffect(() => {
    const precedente = activiteCouvertePrecedenteRef.current;
    activiteCouvertePrecedenteRef.current = activiteCouverte;
    if (precedente === activiteCouverte) {
      return;
    }
    if (activiteCouverte !== false) {
      setValue("activite_non_couverte_texte", "");
    }
  }, [activiteCouverte, setValue]);

  const valider = async () => {
    const estValide = await trigger(CHAMPS_QUESTIONS_METIER);
    if (estValide) {
      onValide();
      return;
    }
    const premierChampInvalide = CHAMPS_QUESTIONS_METIER.find((champ) => errors[champ]);
    if (premierChampInvalide) {
      setFocus(premierChampInvalide);
    }
  };

  const [couverte, texteNonCouverte, travauxStandards] = watch(CHAMPS_QUESTIONS_METIER);

  return {
    register,
    control,
    errors,
    valider,
    activiteNonCouverte,
    activiteCouverteLabel: libelleOuiNon(couverte),
    texteNonCouverte,
    travauxStandardsLabel: libelleOuiNon(travauxStandards),
  };
};
