import { Button, Restitution, TextInput, VerticalStep } from "@axa-fr/canopee-react/distributeur";

import { versStepMode } from "../../helpers/versStepMode";
import type { EtatSection } from "../../types/EtatSection";
import { VilleField } from "../VilleField/VilleField";
import { useAssureSection } from "./useAssureSection";

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
  const { register, errors, valider, nom, ville, numeroContrat } = useAssureSection(onValide);

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
          <VilleField name="assure_ville" label="Ville" />
          <TextInput
            label="Numéro de contrat"
            labelPosition="top"
            required
            inputMode="numeric"
            {...register("assure_numero_contrat")}
            message={errors.assure_numero_contrat?.message}
            forceDisplayMessage={Boolean(errors.assure_numero_contrat)}
          />
          <Button variant="primary" onClick={valider}>
            Valider
          </Button>
        </div>
      }
    />
  );
};
