import { useEffect, useRef } from "react";

import { Button, ChoiceInput, Restitution, TextareaInput, VerticalStep } from "@axa-fr/canopee-react/distributeur";
import { Controller, useFormContext } from "react-hook-form";

import { CHAMPS_QUESTIONS_METIER } from "../../constants/sections";
import { versStepMode } from "../../helpers/versStepMode";
import type { EtatSection } from "../../types/EtatSection";
import type { FdrFormValues } from "../../types/FdrFormValues";

const libelleOuiNon = (valeur: boolean | null): string => (valeur === true ? "Oui" : valeur === false ? "Non" : "—");

export const QuestionsMetierSection = ({
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

  const activiteCouverte = watch("activite_couverte");

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

  const handleValider = async () => {
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

  return (
    <VerticalStep
      id="fdr-section-questions"
      title="Questions métier"
      stepMode={versStepMode(etat)}
      readonly={readonly}
      onEdit={onModifier}
      restitution={
        <div className="fdr-step-contenu fdr-step-contenu--restitution">
          <Restitution label="Activité couverte">
            {libelleOuiNon(couverte)}
            {couverte === false && ` — ${texteNonCouverte}`}
          </Restitution>
          <Restitution label="Travaux standards">{libelleOuiNon(travauxStandards)}</Restitution>
        </div>
      }
      form={
        <div className="fdr-step-contenu">
          <Controller
            name="activite_couverte"
            control={control}
            render={({ field }) => (
              <ChoiceInput
                label="L'activité est-elle couverte par le contrat ?"
                labelPosition="top"
                name={field.name}
                id={field.name}
                value={field.value ?? undefined}
                onChange={(event) => field.onChange(event.target.value === "true")}
                message={errors.activite_couverte?.message}
                forceDisplayMessage={Boolean(errors.activite_couverte)}
              />
            )}
          />
          {activiteCouverte === false && (
            <TextareaInput
              label="Explication"
              labelPosition="top"
              required
              {...register("activite_non_couverte_texte")}
              message={errors.activite_non_couverte_texte?.message}
              forceDisplayMessage={Boolean(errors.activite_non_couverte_texte)}
            />
          )}
          <Controller
            name="travaux_standards"
            control={control}
            render={({ field }) => (
              <ChoiceInput
                label="Les travaux sont-ils standards ?"
                labelPosition="top"
                name={field.name}
                id={field.name}
                value={field.value ?? undefined}
                onChange={(event) => field.onChange(event.target.value === "true")}
                message={errors.travaux_standards?.message}
                forceDisplayMessage={Boolean(errors.travaux_standards)}
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
