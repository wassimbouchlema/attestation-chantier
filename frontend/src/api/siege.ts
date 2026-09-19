import type { DemandeDetail } from "./demandes";
import { ErreurReseauOuServeur, lireJson } from "./http";
import { requeteAuthentifiee } from "./httpAuthentifie";

export type TraitementSiege =
  | { action: "demander-complements"; message: string }
  | { action: "refuser"; motif: string };

export const traiterDemandeSiege = async (id: string, traitement: TraitementSiege): Promise<DemandeDetail> => {
  const { action, ...payload } = traitement;
  const messageIndisponible = "Impossible d'enregistrer le traitement de cette demande.";
  const response = await requeteAuthentifiee(`/siege/demandes/${id}/${action}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (response.status === 400 || response.status === 409) {
    const corps = await lireJson<{ detail?: string; message?: string[]; motif?: string[] }>(response, messageIndisponible);
    throw new ErreurReseauOuServeur(corps.detail ?? corps.message?.[0] ?? corps.motif?.[0] ?? messageIndisponible);
  }
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<DemandeDetail>(response, messageIndisponible);
};
