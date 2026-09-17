import { useEffect } from "react";

import {
  Button,
  DateInput,
  NumberInput,
  Restitution,
  SelectInput,
  TextareaInput,
  VerticalStep,
} from "@axa-fr/canopee-react/distributeur";
import { Controller, useFormContext } from "react-hook-form";

import { OPTIONS_USAGE } from "../../constants/optionsUsage";
import { formatDateFr } from "../../helpers/formatDateFr";
import { formatMontant } from "../../helpers/formatMontant";
import { versStepMode } from "../../helpers/versStepMode";
import type { EtatSection } from "../../types/EtatSection";
import type { FdrFormValues } from "../../types/FdrFormValues";

const CHAMPS_USAGE_CALENDRIER = ["usage", "usage_autre_texte", "date_debut", "date_fin", "montant_total"] as const;

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
    trigger,
    watch,
    setValue,
    setFocus,
    formState: { errors },
  } = useFormContext<FdrFormValues>();

  const usage = watch("usage");

  // usage != AUTRE : la précision devient sans objet, nettoyée immédiatement.
  useEffect(() => {
    if (usage !== "AUTRE") {
      setValue("usage_autre_texte", "");
    }
  }, [usage, setValue]);

  const handleValider = async () => {
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
            {OPTIONS_USAGE.find((option) => option.value === usageValeur)?.label}
            {usageValeur === "AUTRE" && ` — ${usageAutreTexte}`}
          </Restitution>
          <Restitution label="Dates">
            Du {formatDateFr(dateDebut)} au {formatDateFr(dateFin)}
          </Restitution>
          <Restitution label="Montant total">{formatMontant(montantTotal)}</Restitution>
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
          {usage === "AUTRE" && (
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
          <Button variant="primary" onClick={handleValider}>
            Valider
          </Button>
        </div>
      }
    />
  );
};
