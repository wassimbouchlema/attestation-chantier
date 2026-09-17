import {
  Button,
  DateInput,
  NumberInput,
  Restitution,
  SelectInput,
  TextareaInput,
  VerticalStep,
} from "@axa-fr/canopee-react/distributeur";
import { Controller } from "react-hook-form";

import { OPTIONS_USAGE } from "../../constants/optionsUsage";
import { versStepMode } from "../../helpers/versStepMode";
import type { EtatSection } from "../../types/EtatSection";
import { useUsageCalendrierSection } from "./useUsageCalendrierSection";

export const UsageCalendrierSection = ({
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
    usageEstAutre,
    usageLabel,
    usageAutreTexte,
    datesLabel,
    montantTotalLabel,
  } = useUsageCalendrierSection(onValide);

  return (
    <VerticalStep
      id="fdr-section-usage"
      title="Usage & calendrier"
      stepMode={versStepMode(etat)}
      readonly={readonly}
      onEdit={onModifier}
      restitution={
        <div className="fdr-step-contenu fdr-step-contenu--restitution">
          <Restitution label="Usage">
            {usageLabel}
            {usageEstAutre && ` — ${usageAutreTexte}`}
          </Restitution>
          <Restitution label="Dates">{datesLabel}</Restitution>
          <Restitution label="Montant total">{montantTotalLabel}</Restitution>
        </div>
      }
      form={
        <div className="fdr-step-contenu">
          <SelectInput
            label="Usage"
            labelPosition="top"
            mode="base"
            required
            options={OPTIONS_USAGE}
            {...register("usage")}
            message={errors.usage?.message}
            forceDisplayMessage={Boolean(errors.usage)}
          />
          {usageEstAutre && (
            <TextareaInput
              label="Précision de l'usage"
              labelPosition="top"
              required
              {...register("usage_autre_texte")}
              message={errors.usage_autre_texte?.message}
              forceDisplayMessage={Boolean(errors.usage_autre_texte)}
            />
          )}
          <DateInput
            label="Date de début"
            labelPosition="top"
            required
            {...register("date_debut")}
            message={errors.date_debut?.message}
            forceDisplayMessage={Boolean(errors.date_debut)}
          />
          <DateInput
            label="Date de fin"
            labelPosition="top"
            required
            {...register("date_fin")}
            message={errors.date_fin?.message}
            forceDisplayMessage={Boolean(errors.date_fin)}
          />
          {/*
            NumberInput n'est pas un composant forwardRef dans cette version de Canopée
            (contrairement à TextInput/DateInput/SelectInput/TextareaInput) : le `ref` de
            register() est silencieusement ignoré par React, RHF ne capture alors jamais
            la valeur saisie. Controller contourne le besoin de ref (composant piloté par
            value/onChange), seule solution fiable avec ce composant.
          */}
          <Controller
            name="montant_total"
            control={control}
            render={({ field }) => (
              <NumberInput
                label="Montant total (€)"
                labelPosition="top"
                required
                min={0}
                step="0.01"
                name={field.name}
                id={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                message={errors.montant_total?.message}
                forceDisplayMessage={Boolean(errors.montant_total)}
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
