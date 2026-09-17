import { Button, NumberInput, Restitution, SelectInput, TextareaInput, VerticalStep } from "@axa-fr/canopee-react/distributeur";
import { Controller, useFormContext } from "react-hook-form";

import { OPTIONS_INTERVENTION_TYPE } from "../../constants/optionsInterventionType";
import { formatMontant } from "../../helpers/formatMontant";
import { versStepMode } from "../../helpers/versStepMode";
import type { EtatSection } from "../../types/EtatSection";
import type { FdrFormValues } from "../../types/FdrFormValues";

const CHAMPS_INTERVENTION = ["intervention_description", "intervention_montant_prestation", "intervention_type"] as const;

export const InterventionSection = ({
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
    setFocus,
    formState: { errors },
  } = useFormContext<FdrFormValues>();

  const handleValider = async () => {
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

  return (
    <VerticalStep
      id="fdr-section-intervention"
      title="Intervention"
      stepMode={versStepMode(etat)}
      readonly={readonly}
      onEdit={onModifier}
      restitution={
        <div className="fdr-step-contenu fdr-step-contenu--restitution">
          <Restitution label="Description">{description}</Restitution>
          <Restitution label="Montant de la prestation">{formatMontant(montantPrestation)}</Restitution>
          <Restitution label="Type d'intervention">{OPTIONS_INTERVENTION_TYPE.find((option) => option.value === type)?.label}</Restitution>
        </div>
      }
      form={
        <div className="fdr-step-contenu">
          <TextareaInput
            label="Description des travaux"
            labelPosition="top"
            required
            {...register("intervention_description")}
            message={errors.intervention_description?.message}
            forceDisplayMessage={Boolean(errors.intervention_description)}
          />
          {/* NumberInput n'est pas forwardRef dans cette version de Canopée : voir le commentaire équivalent dans UsageCalendrierSection. */}
          <Controller
            name="intervention_montant_prestation"
            control={control}
            render={({ field }) => (
              <NumberInput
                label="Montant de la prestation (€)"
                labelPosition="top"
                required
                min={0}
                step="0.01"
                name={field.name}
                id={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                message={errors.intervention_montant_prestation?.message}
                forceDisplayMessage={Boolean(errors.intervention_montant_prestation)}
              />
            )}
          />
          <SelectInput
            label="Type d'intervention"
            labelPosition="top"
            mode="base"
            required
            options={OPTIONS_INTERVENTION_TYPE}
            {...register("intervention_type")}
            message={errors.intervention_type?.message}
            forceDisplayMessage={Boolean(errors.intervention_type)}
          />
          <Button variant="primary" onClick={handleValider}>
            Valider
          </Button>
        </div>
      }
    />
  );
};
