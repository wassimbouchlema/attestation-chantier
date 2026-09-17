import { Button, MandatoryMention, Message } from "@axa-fr/canopee-react/distributeur";
import { useOutletContext } from "react-router-dom";

import { AssureSection } from "../../features/fdr/components/AssureSection/AssureSection";
import { ChantierSection } from "../../features/fdr/components/ChantierSection/ChantierSection";
import { InterventionSection } from "../../features/fdr/components/InterventionSection/InterventionSection";
import { QuestionsMetierSection } from "../../features/fdr/components/QuestionsMetierSection/QuestionsMetierSection";
import { UsageCalendrierSection } from "../../features/fdr/components/UsageCalendrierSection/UsageCalendrierSection";
import type { FdrOutletContext } from "../../features/fdr/types/FdrOutletContext";
import { useFdrInformationsPage } from "./useFdrInformationsPage";

/**
 * Purement présentatif : toute l'orchestration (hydratation/reprise du
 * brouillon, état des sections, confirmation globale) vit dans
 * useFdrInformationsPage. Les 5 sections sont toujours montées (VerticalStep,
 * frères directs pour sa ligne verticale CSS) ; seuls `etat`/`readonly`
 * (fournis par le hook) changent leur rendu.
 */
export const FdrInformationsPage = () => {
  const { demande } = useOutletContext<FdrOutletContext>();
  const {
    lectureSeule,
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
  } = useFdrInformationsPage(demande);

  return (
    <>
      {!lectureSeule && <MandatoryMention variant="one" />}

      <AssureSection
        etat={etatDe("assure")}
        readonly={lectureSeule}
        onValide={validerSection}
        onModifier={() => modifierSection("assure")}
      />
      <ChantierSection
        etat={etatDe("chantier")}
        readonly={lectureSeule}
        onValide={validerSection}
        onModifier={() => modifierSection("chantier")}
      />
      <UsageCalendrierSection
        etat={etatDe("usage")}
        readonly={lectureSeule}
        onValide={validerSection}
        onModifier={() => modifierSection("usage")}
      />
      <InterventionSection
        etat={etatDe("intervention")}
        readonly={lectureSeule}
        onValide={validerSection}
        onModifier={() => modifierSection("intervention")}
      />
      <QuestionsMetierSection
        etat={etatDe("questions")}
        readonly={lectureSeule}
        onValide={validerSection}
        onModifier={() => modifierSection("questions")}
      />

      {!lectureSeule && erreurValidationGlobale && (
        <Message
          title="Certaines informations doivent être complétées et validées avant de continuer."
          variant="error"
          onClose={fermerErreurValidationGlobale}
          closeButtonAriaLabel="Fermer"
        />
      )}

      {!lectureSeule && erreurConfirmation && (
        <Message
          title={erreurConfirmation}
          variant="error"
          onClose={fermerErreurConfirmation}
          closeButtonAriaLabel="Fermer"
        />
      )}

      {!lectureSeule && (
        <div className="fdr-actions-globales">
          <Button variant="secondary" onClick={retournerAuxDemandes}>
            Retour à mes demandes
          </Button>
          <Button variant="primary" disabled={confirmationEnCours} onClick={confirmerInformations}>
            {confirmationEnCours ? "Confirmation…" : "Confirmer les informations"}
          </Button>
        </div>
      )}
    </>
  );
};
