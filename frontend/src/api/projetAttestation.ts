import { ErreurReseauOuServeur, lireJson } from "./http";
import { requeteAuthentifiee } from "./httpAuthentifie";

/** Reflète `ProjetAttestationSerializer` (backend/demandes/serializers.py). */
export interface ProjetAttestationApi {
  contenu_html: string;
  created_at: string;
  updated_at: string;
}

/**
 * `GET /demandes/{id}/projet-attestation/` — un 404 signifie "aucun projet
 * n'existe encore" (état normal, jamais créé automatiquement), pas une
 * erreur : on renvoie `null` plutôt que de lever une exception.
 */
export const recupererProjetAttestation = async (
  demandeId: string,
  signal?: AbortSignal,
): Promise<ProjetAttestationApi | null> => {
  const messageIndisponible = "Impossible de récupérer le projet d'attestation.";
  const response = await requeteAuthentifiee(`/demandes/${demandeId}/projet-attestation/`, { signal });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<ProjetAttestationApi>(response, messageIndisponible);
};

interface CorpsErreurProjet {
  code?: string;
  detail?: string;
}

/** `POST /demandes/{id}/projet-attestation/` — génère le contenu initial depuis le FDR, aucun body. */
export const creerProjetAttestation = async (demandeId: string): Promise<ProjetAttestationApi> => {
  const messageIndisponible = "Impossible de créer le projet d'attestation.";
  const response = await requeteAuthentifiee(`/demandes/${demandeId}/projet-attestation/`, { method: "POST" });
  if (response.status === 409) {
    const corps = await lireJson<CorpsErreurProjet>(response, messageIndisponible);
    throw new ErreurReseauOuServeur(corps.detail ?? messageIndisponible);
  }
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<ProjetAttestationApi>(response, messageIndisponible);
};

/**
 * `GET /demandes/{id}/projet-attestation/pdf/` — PDF rendu à la demande à
 * partir du contenu **enregistré** (jamais l'état courant de l'éditeur).
 */
export const recupererProjetAttestationPdf = async (demandeId: string): Promise<Blob> => {
  const messageIndisponible = "Impossible de générer le PDF du projet d'attestation.";
  const response = await requeteAuthentifiee(`/demandes/${demandeId}/projet-attestation/pdf/`);
  if (response.status === 404) {
    throw new ErreurReseauOuServeur("Aucun projet d'attestation n'est disponible pour cette demande.");
  }
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return response.blob();
};

/** `PATCH /demandes/{id}/projet-attestation/` — sauvegarde `contenu_html` (sanitizé côté backend, seule source de vérité). */
export const sauvegarderProjetAttestation = async (
  demandeId: string,
  contenuHtml: string,
): Promise<ProjetAttestationApi> => {
  const messageIndisponible = "Impossible d'enregistrer le projet d'attestation.";
  const response = await requeteAuthentifiee(`/demandes/${demandeId}/projet-attestation/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contenu_html: contenuHtml }),
  });
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<ProjetAttestationApi>(response, messageIndisponible);
};
