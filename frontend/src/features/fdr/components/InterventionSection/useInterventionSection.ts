import { useFormContext } from "react-hook-form";

import { OPTIONS_INTERVENTION_TYPE } from "../../constants/optionsInterventionType";
import { CHAMPS_INTERVENTION } from "../../constants/sections";
import { formatMontant } from "../../helpers/formatMontant";
import type { FdrFormValues } from "../../types/FdrFormValues";

/** Orchestration RHF de la section Intervention : validation locale, focus, valeurs de restitution. */
export const useInterventionSection = (onValide: () => void) => {
  const {
    register,
    control,
    trigger,
    watch,
    setFocus,
    formState: { errors },
  } = useFormContext<FdrFormValues>();

  const valider = async () => {
    const estValide = await trigger(CHAMPS_INTERVENTION);
    if (estValide) {
      onValide();
      return;
    }
    const premierChampInvalide = CHAMPS_INTERVENTION.find((champ) => errors[champ]);
    if (premierChampInvalide) {
      setFocus(premierChampInvalide);
    }
  };

  const [description, montantPrestation, type] = watch(CHAMPS_INTERVENTION);

  return {
    register,
    control,
    errors,
    valider,
    description,
    montantPrestationLabel: formatMontant(montantPrestation),
    typeInterventionLabel: OPTIONS_INTERVENTION_TYPE.find((option) => option.value === type)?.label,
  };
};
