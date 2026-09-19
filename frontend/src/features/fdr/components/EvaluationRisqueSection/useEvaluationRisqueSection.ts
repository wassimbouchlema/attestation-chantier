import { messageErreurAffichable } from "../../../demandes/helpers/messageErreur";
import { useEvaluationRisque } from "../../queries";

/** Orchestration (query TanStack Query) pour EvaluationRisqueSection. */
export const useEvaluationRisqueSection = (demandeId: string, basePath?: string) => {
  const evaluationRisqueQuery = useEvaluationRisque(demandeId, basePath);

  return {
    isLoading: evaluationRisqueQuery.isLoading,
    erreurChargement: evaluationRisqueQuery.isError ? messageErreurAffichable(evaluationRisqueQuery.error) : null,
    reessayerChargement: () => evaluationRisqueQuery.refetch(),
    resultat: evaluationRisqueQuery.data ?? null,
  };
};
