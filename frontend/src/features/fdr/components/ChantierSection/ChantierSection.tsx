import { useEffect, useRef } from "react";

import { Button, ChoiceInput, Restitution, SelectInput, TextInput, VerticalStep } from "@axa-fr/canopee-react/distributeur";
import { Controller, useFormContext } from "react-hook-form";

import { OPTIONS_TYPE_CHANTIER } from "../../constants/optionsTypeChantier";
import { CHAMPS_CHANTIER } from "../../constants/sections";
import { versStepMode } from "../../helpers/versStepMode";
import type { EtatSection } from "../../types/EtatSection";
import type { FdrFormValues } from "../../types/FdrFormValues";

const libelleOuiNon = (valeur: boolean | null): string => (valeur === true ? "Oui" : valeur === false ? "Non" : "—");

export const ChantierSection = ({
  etat,
  readonly,
  onValide,
  onModifier,
}: {
  etat: EtatSection;
  readonly: boolean;
  onValide: () => void;
  onModifier: () => void;
}) => {
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

  const handleValider = async () => {
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

  return (
    <VerticalStep
      id="fdr-section-chantier"
      title="Chantier"
      stepMode={versStepMode(etat)}
      readonly={readonly}
      onEdit={onModifier}
      restitution={
        <div className="fdr-step-contenu fdr-step-contenu--restitution">
          <Restitution label="Nom du chantier">{nom}</Restitution>
          <Restitution label="Ville">{ville}</Restitution>
          <Restitution label="Type de chantier">{OPTIONS_TYPE_CHANTIER.find((option) => option.value === type)?.label}</Restitution>
          {type === "RENOVATION" && <Restitution label="Modification de structure">{libelleOuiNon(modifStructure)}</Restitution>}
          <Restitution label="Chantier atypique">{libelleOuiNon(atypique)}</Restitution>
        </div>
      }
      form={
        <div className="fdr-step-contenu">
          <TextInput
            label="Nom du chantier"
            labelPosition="top"
            required
            {...register("chantier_nom")}
            message={errors.chantier_nom?.message}
            forceDisplayMessage={Boolean(errors.chantier_nom)}
          />
          <TextInput
            label="Ville"
            labelPosition="top"
            required
            {...register("chantier_ville")}
            message={errors.chantier_ville?.message}
            forceDisplayMessage={Boolean(errors.chantier_ville)}
          />
          <SelectInput
            label="Type de chantier"
            labelPosition="top"
            mode="base"
            required
            options={OPTIONS_TYPE_CHANTIER}
            {...register("type_chantier")}
            message={errors.type_chantier?.message}
            forceDisplayMessage={Boolean(errors.type_chantier)}
          />
          {typeChantier === "RENOVATION" && (
            <Controller
              name="modification_structure"
              control={control}
              render={({ field }) => (
                <ChoiceInput
                  label="Modification de structure ?"
                  labelPosition="top"
                  name={field.name}
                  id={field.name}
                  value={field.value ?? undefined}
                  onChange={(event) => field.onChange(event.target.value === "true")}
                  message={errors.modification_structure?.message}
                  forceDisplayMessage={Boolean(errors.modification_structure)}
                />
              )}
            />
          )}
          <Controller
            name="chantier_atypique"
            control={control}
            render={({ field }) => (
              <ChoiceInput
                label="Chantier atypique ?"
                labelPosition="top"
                name={field.name}
                id={field.name}
                value={field.value ?? undefined}
                onChange={(event) => field.onChange(event.target.value === "true")}
                message={errors.chantier_atypique?.message}
                forceDisplayMessage={Boolean(errors.chantier_atypique)}
              />
            )}
          />
          <Button variant="primary" onClick={handleValider}>
            Valider
          </Button>
        </div>
      }
    />
  );
};
