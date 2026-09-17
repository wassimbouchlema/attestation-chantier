import { Button } from "@axa-fr/canopee-react/distributeur";
import { useOutletContext } from "react-router-dom";

import { EvaluationRisqueSection } from "../../features/fdr/components/EvaluationRisqueSection/EvaluationRisqueSection";
import { PiecesJustificativesSection } from "../../features/fdr/components/PiecesJustificativesSection/PiecesJustificativesSection";
import type { FdrOutletContext } from "../../features/fdr/types/FdrOutletContext";
import { useFdrPiecesPage } from "./useFdrPiecesPage";

/**
 * Purement présentatif : orchestration (lectureSeule, titre, navigation) dans
 * useFdrPiecesPage. Chaque section porte elle-même sa query/mutation
 * (PiecesJustificativesSection / EvaluationRisqueSection).
 */
export const FdrPiecesPage = () => {
  const { demande } = useOutletContext<FdrOutletContext>();
  const { lectureSeule, retournerAuxInformations } = useFdrPiecesPage(demande);

  return (
    <>
      <PiecesJustificativesSection demandeId={demande.id} lectureSeule={lectureSeule} />
      <EvaluationRisqueSection demandeId={demande.id} />

      <div className="fdr-actions-globales">
        <Button variant="secondary" onClick={retournerAuxInformations}>
          Retour aux informations
        </Button>
      </div>
    </>
  );
};
