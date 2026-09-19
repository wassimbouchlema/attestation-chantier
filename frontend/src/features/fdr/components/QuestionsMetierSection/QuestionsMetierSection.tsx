import { Button, ChoiceInput, Restitution, TextareaInput, VerticalStep } from "@axa-fr/canopee-react/distributeur";
import { Controller } from "react-hook-form";

import { versStepMode } from "../../helpers/versStepMode";
import type { EtatSection } from "../../types/EtatSection";
import { useQuestionsMetierSection } from "./useQuestionsMetierSection";

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
    errors,
    valider,
    activiteNonCouverte,
    activiteCouverteLabel,
    texteNonCouverte,
    travauxStandardsLabel,
  } = useQuestionsMetierSection(onValide);

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
            {activiteCouverteLabel}
            {activiteNonCouverte && ` — ${texteNonCouverte}`}
          </Restitution>
          <Restitution label="Travaux standards">{travauxStandardsLabel}</Restitution>
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
          {activiteNonCouverte && (
            <TextareaInput
              label="Explication"
              labelPosition="top"
              required
              rows={5}
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
          <Button variant="primary" onClick={valider}>
            Valider
          </Button>
        </div>
      }
    />
  );
};
