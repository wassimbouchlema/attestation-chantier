import type { DemandeDetail } from "./demandes";
import { ErreurReseauOuServeur, lireJson } from "./http";
import { requeteAuthentifiee } from "./httpAuthentifie";

export interface AttestationApi {
  id: string;
  demande: string;
  contenu_html: string;
  created_at: string;
  updated_at: string;
  pdf_final: string | null;
  validated_at: string | null;
}

export interface ResultatCoherenceApi {
  backend: "mistral" | "simulation";
  coherent: boolean;
  resume: string;
  anomalies: {
    type: "VALEUR_DIFFERENTE" | "INFORMATION_ABSENTE" | "CONTRADICTION";
    champ: string;
    valeur_fdr: string;
    valeur_attestation: string;
    message: string;
  }[];
}

const urlAttestation = (id: string) => `/siege/demandes/${id}/attestation/`;

const verifierReponse = async (response: Response, message: string) => {
  if (!response.ok) {
    const corps = await lireJson<{ detail?: string; contenu_html?: string[] }>(response, message);
    throw new ErreurReseauOuServeur(corps.detail ?? corps.contenu_html?.[0] ?? message);
  }
};

export const analyserCoherenceAttestation = async (id: string): Promise<ResultatCoherenceApi> => {
  const response = await requeteAuthentifiee(`${urlAttestation(id)}analyser-coherence/`, { method: "POST" });
  const message = "Le contrôle de cohérence est indisponible. Réessayez plus tard.";
  await verifierReponse(response, message);
  return lireJson<ResultatCoherenceApi>(response, message);
};

export const recupererAttestation = async (id: string, signal?: AbortSignal): Promise<AttestationApi | null> => {
  const response = await requeteAuthentifiee(urlAttestation(id), { signal });
  if (response.status === 404) return null;
  const message = "Impossible de récupérer l'attestation.";
  await verifierReponse(response, message);
  return lireJson<AttestationApi>(response, message);
};

export const preparerAttestation = async (id: string): Promise<AttestationApi> => {
  const response = await requeteAuthentifiee(`${urlAttestation(id)}preparer/`, { method: "POST" });
  const message = "Impossible de préparer l'attestation.";
  await verifierReponse(response, message);
  return lireJson<AttestationApi>(response, message);
};

export const sauvegarderAttestation = async (id: string, contenuHtml: string): Promise<AttestationApi> => {
  const response = await requeteAuthentifiee(urlAttestation(id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contenu_html: contenuHtml }),
  });
  const message = "Impossible d'enregistrer l'attestation.";
  await verifierReponse(response, message);
  return lireJson<AttestationApi>(response, message);
};

export const validerAttestation = async (id: string): Promise<DemandeDetail> => {
  const response = await requeteAuthentifiee(`${urlAttestation(id)}valider/`, { method: "POST" });
  const message = "Impossible de valider l'attestation.";
  await verifierReponse(response, message);
  return lireJson<DemandeDetail>(response, message);
};

export const recupererAttestationFinalePdf = async (id: string): Promise<Blob> => {
  const response = await requeteAuthentifiee(`/demandes/${id}/attestation-finale/pdf/`);
  await verifierReponse(response, "Impossible de récupérer l'attestation définitive.");
  return response.blob();
};

export const recupererAttestationPdf = async (id: string): Promise<Blob> => {
  const response = await requeteAuthentifiee(`${urlAttestation(id)}pdf/`);
  await verifierReponse(response, "Impossible de générer la prévisualisation.");
  return response.blob();
};
