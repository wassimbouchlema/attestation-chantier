import { useFormContext } from "react-hook-form";

import { CHAMPS_ASSURE } from "../../constants/sections";
import type { FdrFormValues } from "../../types/FdrFormValues";

/** Orchestration RHF de la section Assuré : validation locale, focus, valeurs de restitution. */
export const useAssureSection = (onValide: () => void) => {
  const {
    register,
    trigger,
    watch,
    setFocus,
    formState: { errors },
  } = useFormContext<FdrFormValues>();

  const valider = async () => {
    const estValide = await trigger(CHAMPS_ASSURE);
    if (estValide) {
      onValide();
      return;
    }
    const premierChampInvalide = CHAMPS_ASSURE.find((champ) => errors[champ]);
    if (premierChampInvalide) {
      setFocus(premierChampInvalide);
    }
  };

  const [nom, ville, numeroContrat] = watch(CHAMPS_ASSURE);

  return { register, errors, valider, nom, ville, numeroContrat };
};
