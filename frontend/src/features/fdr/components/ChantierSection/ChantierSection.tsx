import { Button, ChoiceInput, Restitution, SelectInput, TextInput, VerticalStep } from "@axa-fr/canopee-react/distributeur";
import { Controller } from "react-hook-form";

import { OPTIONS_TYPE_CHANTIER } from "../../constants/optionsTypeChantier";
import { versStepMode } from "../../helpers/versStepMode";
import type { EtatSection } from "../../types/EtatSection";
import { VilleField } from "../VilleField/VilleField";
import { useChantierSection } from "./useChantierSection";

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
    errors,
    valider,
    chantierEstRenovation,
    nom,
    ville,
    typeChantierLabel,
    modificationStructureLabel,
    chantierAtypiqueLabel,
  } = useChantierSection(onValide);

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
          <Restitution label="Type de chantier">{typeChantierLabel}</Restitution>
          {chantierEstRenovation && <Restitution label="Modification de structure">{modificationStructureLabel}</Restitution>}
          <Restitution label="Chantier atypique">{chantierAtypiqueLabel}</Restitution>
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
          <VilleField name="chantier_ville" label="Ville" />
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
          {chantierEstRenovation && (
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
          <Button variant="primary" onClick={valider}>
            Valider
          </Button>
        </div>
      }
    />
  );
};
