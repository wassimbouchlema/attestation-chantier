import { ErreurReseauOuServeur, lireJson } from "./http";
import { requeteAuthentifiee } from "./httpAuthentifie";

/** Reflète `ReportingView` (backend/demandes/views/reporting.py). */
export interface ReportingApi {
  total: number;
  brouillons: number;
  en_cours: number;
  acceptees: number;
  refusees: number;
}

export const recupererReporting = async (signal?: AbortSignal): Promise<ReportingApi> => {
  const messageIndisponible = "Impossible de récupérer la synthèse des demandes.";
  const response = await requeteAuthentifiee("/reporting/", { signal });
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<ReportingApi>(response, messageIndisponible);
};
