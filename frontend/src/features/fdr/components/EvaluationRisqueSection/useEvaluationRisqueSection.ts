import { messageErreurAffichable } from "../../../demandes/helpers/messageErreur";
import { useEvaluationRisque } from "../../queries";

/** Orchestration (query TanStack Query) pour EvaluationRisqueSection. */
export const useEvaluationRisqueSection = (demandeId: string) => {
  const evaluationRisqueQuery = useEvaluationRisque(demandeId);

  return {
    isLoading: evaluationRisqueQuery.isLoading,
    erreurChargement: evaluationRisqueQuery.isError ? messageErreurAffichable(evaluationRisqueQuery.error) : null,
    reessayerChargement: () => evaluationRisqueQuery.refetch(),
    resultat: evaluationRisqueQuery.data ?? null,
  };
};
