import { Button, MainContainer, MandatoryMention, Message } from "@axa-fr/canopee-react/distributeur";
import { useEffect, useRef } from "react";
import { FormProvider } from "react-hook-form";
import { Link } from "react-router-dom";

import { AssureSection } from "../../features/fdr/components/AssureSection/AssureSection";
import { ChantierSection } from "../../features/fdr/components/ChantierSection/ChantierSection";
import { FdrStepper } from "../../features/fdr/components/FdrStepper/FdrStepper";
import { InterventionSection } from "../../features/fdr/components/InterventionSection/InterventionSection";
import {
  PreremplissageDocumentApercu,
  PreremplissageDocumentUpload,
} from "../../features/fdr/components/PreremplissageDocumentSection/PreremplissageDocumentSection";
import { QuestionsMetierSection } from "../../features/fdr/components/QuestionsMetierSection/QuestionsMetierSection";
import { UsageCalendrierSection } from "../../features/fdr/components/UsageCalendrierSection/UsageCalendrierSection";
import { PageHeader } from "../../layout/PageHeader";
import { useFdrNouvelleDemandePage } from "./useFdrNouvelleDemandePage";

export const FdrNouvelleDemandePage = () => {
  const {
    methods,
    preremplissage,
    etatDe,
    modifierSection,
    validerSection,
    erreurValidationGlobale,
    fermerErreurValidationGlobale,
    erreurConfirmation,
    fermerErreurConfirmation,
    confirmationEnCours,
    confirmerInformations,
    retournerAuxDemandes,
  } = useFdrNouvelleDemandePage();

  const messageGlobal = erreurValidationGlobale
    ? "Certaines informations doivent être complétées et validées avant de continuer."
    : erreurConfirmation;
  const fermerMessageGlobal = erreurValidationGlobale ? fermerErreurValidationGlobale : fermerErreurConfirmation;

  const messageGlobalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (messageGlobal) {
      messageGlobalRef.current?.focus();
      messageGlobalRef.current?.scrollIntoView?.({ block: "center" });
    }
  }, [messageGlobal]);

  return (
    <>
      <PageHeader
        title="Nouvelle demande d'attestation"
        actions={<Link to="/distributeur">Retour à mes demandes</Link>}
      />
      <FormProvider {...methods}>
        <div className="af-container">
          <PreremplissageDocumentUpload page={preremplissage} />
          <FdrStepper />
        </div>
        <MainContainer>
          <div className="container-fluid app-shell__content">
            {messageGlobal && (
              <div ref={messageGlobalRef} tabIndex={-1}>
                <Message
                  title={messageGlobal}
                  variant="error"
                  onClose={fermerMessageGlobal}
                  closeButtonAriaLabel="Fermer"
                />
              </div>
            )}

            <PreremplissageDocumentApercu page={preremplissage} />

            <MandatoryMention variant="one" />

            <AssureSection
              etat={etatDe("assure")}
              readonly={false}
              onValide={validerSection}
              onModifier={() => modifierSection("assure")}
            />
            <ChantierSection
              etat={etatDe("chantier")}
              readonly={false}
              onValide={validerSection}
              onModifier={() => modifierSection("chantier")}
            />
            <UsageCalendrierSection
              etat={etatDe("usage")}
              readonly={false}
              onValide={validerSection}
              onModifier={() => modifierSection("usage")}
            />
            <InterventionSection
              etat={etatDe("intervention")}
              readonly={false}
              onValide={validerSection}
              onModifier={() => modifierSection("intervention")}
            />
            <QuestionsMetierSection
              etat={etatDe("questions")}
              readonly={false}
              onValide={validerSection}
              onModifier={() => modifierSection("questions")}
            />

            <div className="fdr-actions-globales">
              <Button variant="secondary" onClick={retournerAuxDemandes}>
                Retour à mes demandes
              </Button>
              <Button variant="primary" disabled={confirmationEnCours} onClick={confirmerInformations}>
                {confirmationEnCours ? "Confirmation…" : "Confirmer les informations"}
              </Button>
            </div>
          </div>
        </MainContainer>
      </FormProvider>
    </>
  );
};
