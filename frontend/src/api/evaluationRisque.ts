import { ErreurReseauOuServeur, lireJson } from "./http";
import { requeteAuthentifiee } from "./httpAuthentifie";

export type NiveauRisque = "faible" | "modere" | "eleve";

/** Reflète `GET /demandes/{id}/evaluation-risque/` — scoring fictif et indicatif, jamais une probabilité actuarielle réelle. */
export interface EvaluationRisqueApi {
  score: number;
  niveau: NiveauRisque;
  synthese: string;
}

export const recupererEvaluationRisque = async (
  demandeId: string,
  signal?: AbortSignal,
): Promise<EvaluationRisqueApi> => {
  const messageIndisponible = "Impossible de récupérer l'évaluation du risque.";
  const response = await requeteAuthentifiee(`/demandes/${demandeId}/evaluation-risque/`, { signal });
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<EvaluationRisqueApi>(response, messageIndisponible);
};
