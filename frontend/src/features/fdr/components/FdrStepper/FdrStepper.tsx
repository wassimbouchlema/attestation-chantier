import { Step, Steps } from "@axa-fr/canopee-react/distributeur";

import "./FdrStepper.css";
import { useFdrStepper } from "./useFdrStepper";

export const FdrStepper = () => {
  const {
    modeInformations,
    hrefInformations,
    allerAuxInformations,
    modePieces,
    hrefPieces,
    allerAuxPieces,
    modeValidation,
  } = useFdrStepper();

  return (
    <Steps>
      <Step
        number={1}
        id="fdr-etape-informations"
        title="Informations"
        mode={modeInformations}
        href={hrefInformations}
        onClick={allerAuxInformations}
      />
      <Step
        number={2}
        id="fdr-etape-pieces"
        title="Pièces & risque"
        mode={modePieces}
        href={hrefPieces}
        onClick={allerAuxPieces}
      />
      <Step
        number={3}
        id="fdr-etape-validation"
        title="Validation & envoi"
        mode={modeValidation}
        classModifier={modeValidation === "active" ? "fdr-etape-validation-active" : undefined}
      />
    </Steps>
  );
};
