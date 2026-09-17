import { Step, Steps } from "@axa-fr/canopee-react/distributeur";

import { useFdrStepper } from "./useFdrStepper";

/**
 * Étape 3 volontairement toujours en mode "disabled" : aucune route
 * /validation n'existe encore. StepDisabled ne génère aucun href/lien, donc
 * aucun risque de contournement vers une route inexistante.
 */
export const FdrStepper = () => {
  const { modeInformations, hrefInformations, allerAuxInformations, modePieces } = useFdrStepper();

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
      <Step number={2} id="fdr-etape-pieces" title="Pièces & risque" mode={modePieces} />
      <Step number={3} id="fdr-etape-validation" title="Validation & envoi" mode="disabled" />
    </Steps>
  );
};
