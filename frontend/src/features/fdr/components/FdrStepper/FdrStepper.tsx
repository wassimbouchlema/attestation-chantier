import { Step, Steps } from "@axa-fr/canopee-react/distributeur";

/**
 * Étapes 2/3 volontairement en mode "disabled" : aucune route /pieces ou
 * /validation n'existe encore dans cette carte. StepDisabled ne génère
 * aucun href/lien, donc aucun risque de contournement vers une route
 * inexistante.
 */
export const FdrStepper = () => {
  return (
    <Steps>
      <Step number={1} id="fdr-etape-informations" title="Informations" mode="active" />
      <Step number={2} id="fdr-etape-pieces" title="Pièces & risque" mode="disabled" />
      <Step number={3} id="fdr-etape-validation" title="Validation & envoi" mode="disabled" />
    </Steps>
  );
};
