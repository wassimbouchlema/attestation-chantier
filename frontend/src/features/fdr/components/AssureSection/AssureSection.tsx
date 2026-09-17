import { Button, Restitution, TextInput, VerticalStep } from "@axa-fr/canopee-react/distributeur";
import { useFormContext } from "react-hook-form";

import { CHAMPS_ASSURE } from "../../constants/sections";
import { versStepMode } from "../../helpers/versStepMode";
import type { EtatSection } from "../../types/EtatSection";
import type { FdrFormValues } from "../../types/FdrFormValues";

export const AssureSection = ({
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
    trigger,
    watch,
    setFocus,
    formState: { errors },
  } = useFormContext<FdrFormValues>();

  const handleValider = async () => {
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

  return (
    <VerticalStep
      id="fdr-section-assure"
      title="Assuré"
      stepMode={versStepMode(etat)}
      readonly={readonly}
      onEdit={onModifier}
      restitution={
        <div className="fdr-step-contenu fdr-step-contenu--restitution">
          <Restitution label="Nom / raison sociale">{nom}</Restitution>
          <Restitution label="Ville">{ville}</Restitution>
          <Restitution label="Numéro de contrat">{numeroContrat}</Restitution>
        </div>
      }
      form={
        <div className="fdr-step-contenu">
          <TextInput
            label="Nom / raison sociale"
            labelPosition="top"
            required
            {...register("assure_nom")}
            message={errors.assure_nom?.message}
            forceDisplayMessage={Boolean(errors.assure_nom)}
          />
          <TextInput
            label="Ville"
            labelPosition="top"
            required
            {...register("assure_ville")}
            message={errors.assure_ville?.message}
            forceDisplayMessage={Boolean(errors.assure_ville)}
          />
          <TextInput
            label="Numéro de contrat"
            labelPosition="top"
            required
            inputMode="numeric"
            {...register("assure_numero_contrat")}
            message={errors.assure_numero_contrat?.message}
            forceDisplayMessage={Boolean(errors.assure_numero_contrat)}
          />
          <Button variant="primary" onClick={handleValider}>
            Valider
          </Button>
        </div>
      }
    />
  );
};
