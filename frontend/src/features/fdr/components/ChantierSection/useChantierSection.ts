import { useEffect, useRef } from "react";

import { useFormContext } from "react-hook-form";

import { OPTIONS_TYPE_CHANTIER } from "../../constants/optionsTypeChantier";
import { CHAMPS_CHANTIER } from "../../constants/sections";
import { libelleOuiNon } from "../../helpers/libelleOuiNon";
import type { FdrFormValues } from "../../types/FdrFormValues";

/** Orchestration RHF de la section Chantier : validation locale, focus, nettoyage conditionnel, valeurs de restitution. */
export const useChantierSection = (onValide: () => void) => {
  const {
    register,
    control,
    trigger,
    watch,
    setValue,
    setFocus,
    formState: { errors },
  } = useFormContext<FdrFormValues>();

  const typeChantier = watch("type_chantier");
  const chantierEstRenovation = typeChantier === "RENOVATION";

  // Ne nettoie que sur un changement RÉEL de type_chantier (vs sa valeur
  // précédente) : au montage, ce watch peut encore valoir "" (avant le
  // reset() d'hydratation du parent), et StrictMode rejoue cet effet avec
  // cette même valeur — une garde "ignorer le premier rendu" ne suffirait pas.
  const typeChantierPrecedentRef = useRef(typeChantier);
  useEffect(() => {
    const precedent = typeChantierPrecedentRef.current;
    typeChantierPrecedentRef.current = typeChantier;
    if (precedent === typeChantier) {
      return;
    }
    if (typeChantier !== "RENOVATION") {
      setValue("modification_structure", null);
    }
  }, [typeChantier, setValue]);

  const valider = async () => {
    const estValide = await trigger(CHAMPS_CHANTIER);
    if (estValide) {
      onValide();
      return;
    }
    const premierChampInvalide = CHAMPS_CHANTIER.find((champ) => errors[champ]);
    if (premierChampInvalide) {
      setFocus(premierChampInvalide);
    }
  };

  const [nom, ville, type, modifStructure, atypique] = watch([
    "chantier_nom",
    "chantier_ville",
    "type_chantier",
    "modification_structure",
    "chantier_atypique",
  ]);

  return {
    register,
    control,
    errors,
    valider,
    chantierEstRenovation,
    nom,
    ville,
    typeChantierLabel: OPTIONS_TYPE_CHANTIER.find((option) => option.value === type)?.label,
    modificationStructureLabel: libelleOuiNon(modifStructure),
    chantierAtypiqueLabel: libelleOuiNon(atypique),
  };
};
