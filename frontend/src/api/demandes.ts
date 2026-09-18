import type { CategoriePiece } from "./pieces";
import { ErreurAuthentification, ErreurReseauOuServeur, lireJson } from "./http";
import { requeteAuthentifiee } from "./httpAuthentifie";

// Réexportées : les sites d'import existants (hooks, composants, tests)
// continuent de les importer depuis api/demandes.ts sans changement.
export { ErreurAuthentification, ErreurReseauOuServeur };

/**
 * Doit correspondre à `DemandePagination.page_size` (backend/demandes/views.py).
 * DRF ne renvoie pas la taille de page dans la réponse paginée (count/next/
 * previous/results) : c'est la seule façon pour le front de calculer un
 * nombre total de pages. Dépendance explicite et minimale, pas dupliquée
 * ailleurs.
 */
export const TAILLE_PAGE = 10;

export type StatutDemande = "BROUILLON" | "EN_COURS" | "TRAITE";

export interface Demande {
  id: string;
  distributeur: number;
  statut: StatutDemande;
  created_at: string;
  updated_at: string;
  envoye_at: string | null;
}

export type TypeChantier = "" | "NEUVE" | "RENOVATION";
export type UsageChantier = "" | "HABITATION" | "BUREAU" | "COMMERCE" | "AUTRE";
export type TypeIntervention = "" | "PRINCIPALE" | "SOUS_TRAITANT";

/**
 * Reflète exactement `FormulaireRisqueSerializer` (backend/demandes/serializers.py).
 * Les champs texte/choix sont `blank=True` sans `null=True` : jamais `null`
 * côté API, toujours `""` au minimum. Les dates/décimaux/booléens sont
 * `null=True` : `null` tant qu'aucune valeur n'a été saisie. Les décimaux
 * sont sérialisés en chaîne par DRF (COERCE_DECIMAL_TO_STRING, réglage par
 * défaut non modifié dans settings.py), jamais en `number`.
 */
export interface FormulaireRisqueApi {
  assure_nom: string;
  assure_ville: string;
  assure_numero_contrat: string;
  chantier_nom: string;
  chantier_ville: string;
  type_chantier: TypeChantier;
  modification_structure: boolean | null;
  chantier_atypique: boolean | null;
  usage: UsageChantier;
  usage_autre_texte: string;
  date_debut: string | null;
  date_fin: string | null;
  montant_total: string | null;
  intervention_description: string;
  intervention_montant_prestation: string | null;
  intervention_type: TypeIntervention;
  activite_couverte: boolean | null;
  activite_non_couverte_texte: string;
  travaux_standards: boolean | null;
}

/** Forme renvoyée par `GET /demandes/{id}/` (DemandeDetailSerializer) : la Demande avec son FDR imbriqué en lecture seule. */
export interface DemandeDetail extends Demande {
  commentaire_distributeur: string;
  fdr: FormulaireRisqueApi;
}

export interface DemandesPaginees {
  count: number;
  next: string | null;
  previous: string | null;
  results: Demande[];
}

/** La demande ciblée n'existe pas ou n'appartient pas à l'utilisateur connecté (404). */
export class ErreurDemandeIntrouvable extends Error {}

export class ErreurDemandeNonModifiable extends Error {}

export class ErreurDossierIncomplet extends Error {
  piecesManquantes: CategoriePiece[];

  constructor(piecesManquantes: CategoriePiece[]) {
    super("Le dossier documentaire est incomplet.");
    this.piecesManquantes = piecesManquantes;
  }
}

export class ErreurFdrInvalide extends Error {
  erreurs: Record<string, string>;

  constructor(erreurs: Record<string, string>) {
    super("Certaines informations du formulaire sont incomplètes ou incohérentes.");
    this.erreurs = erreurs;
  }
}

export const listerDemandes = async (
  filtres: { statut?: StatutDemande | ""; page?: number },
  signal?: AbortSignal,
): Promise<DemandesPaginees> => {
  const messageIndisponible = "Impossible de récupérer vos demandes.";
  const params = new URLSearchParams();
  if (filtres.statut) {
    params.set("statut", filtres.statut);
  }
  if (filtres.page && filtres.page > 1) {
    params.set("page", String(filtres.page));
  }
  const queryString = params.toString();

  const response = await requeteAuthentifiee(`/demandes/${queryString ? `?${queryString}` : ""}`, { signal });
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<DemandesPaginees>(response, messageIndisponible);
};

export const recupererDemande = async (id: string, signal?: AbortSignal): Promise<DemandeDetail> => {
  const messageIndisponible = "Impossible de récupérer cette demande.";
  const response = await requeteAuthentifiee(`/demandes/${id}/`, { signal });
  if (response.status === 404) {
    throw new ErreurDemandeIntrouvable("Cette demande est introuvable.");
  }
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<DemandeDetail>(response, messageIndisponible);
};

/**
 * Création atomique de la demande + son FDR (`POST /demandes/`, body
 * `{"fdr": {...}}`) : le brouillon n'existe qu'une fois les informations
 * confirmées valides, jamais avant (pas de brouillon vide créé au clic
 * "Nouvelle demande").
 */
export const creerDemandeAvecFdr = async (fdr: FormulaireRisqueApi): Promise<DemandeDetail> => {
  const messageIndisponible = "Impossible de créer la demande.";
  const response = await requeteAuthentifiee("/demandes/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fdr }),
  });
  if (response.status === 400) {
    const corps = await lireJson<{ code?: string; erreurs?: Record<string, string> }>(response, messageIndisponible);
    if (corps.code === "FDR_INVALIDE") {
      throw new ErreurFdrInvalide(corps.erreurs ?? {});
    }
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<DemandeDetail>(response, messageIndisponible);
};

export const supprimerDemande = async (id: string): Promise<void> => {
  const messageIndisponible = "Impossible de supprimer ce brouillon.";
  const response = await requeteAuthentifiee(`/demandes/${id}/`, { method: "DELETE" });
  if (response.status === 404) {
    throw new ErreurDemandeIntrouvable("Cette demande est introuvable.");
  }
  if (response.status === 409) {
    throw new ErreurDemandeNonModifiable("Cette demande n'est plus modifiable (statut différent de BROUILLON).");
  }
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
};

/** Sauvegarde technique du FDR (`PATCH /demandes/{id}/fdr/`) : ne change pas le statut, ne déclenche aucun calcul métier. */
export const mettreAJourFdr = async (
  demandeId: string,
  payload: FormulaireRisqueApi,
): Promise<FormulaireRisqueApi> => {
  const messageIndisponible = "Impossible d'enregistrer le formulaire de déclaration du risque.";
  const response = await requeteAuthentifiee(`/demandes/${demandeId}/fdr/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<FormulaireRisqueApi>(response, messageIndisponible);
};

/** Action ciblée `PATCH /demandes/{id}/commentaire/` — jamais un PATCH générique sur Demande, reste en BROUILLON. */
export const sauvegarderCommentaire = async (
  demandeId: string,
  commentaireDistributeur: string,
): Promise<{ commentaire_distributeur: string }> => {
  const messageIndisponible = "Impossible d'enregistrer le commentaire.";
  const response = await requeteAuthentifiee(`/demandes/${demandeId}/commentaire/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commentaire_distributeur: commentaireDistributeur }),
  });
  if (response.status === 409) {
    throw new ErreurDemandeNonModifiable("Cette demande n'est plus modifiable (statut différent de BROUILLON).");
  }
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<{ commentaire_distributeur: string }>(response, messageIndisponible);
};

interface CorpsErreurEnvoi {
  code?: string;
  detail?: string;
  pieces_manquantes?: CategoriePiece[];
  erreurs?: Record<string, string>;
}

export const envoyerDemande = async (
  demandeId: string,
  commentaireDistributeur: string,
): Promise<DemandeDetail> => {
  const messageIndisponible = "Impossible d'envoyer cette demande au siège.";
  const response = await requeteAuthentifiee(`/demandes/${demandeId}/envoyer/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commentaire_distributeur: commentaireDistributeur }),
  });

  if (response.status === 404) {
    throw new ErreurDemandeIntrouvable("Cette demande est introuvable.");
  }
  if (response.status === 409) {
    throw new ErreurDemandeNonModifiable("Cette demande n'est plus modifiable (statut différent de BROUILLON).");
  }
  if (response.status === 400) {
    const corps = await lireJson<CorpsErreurEnvoi>(response, messageIndisponible);
    if (corps.code === "DOSSIER_INCOMPLET") {
      throw new ErreurDossierIncomplet(corps.pieces_manquantes ?? []);
    }
    if (corps.code === "FDR_INVALIDE") {
      throw new ErreurFdrInvalide(corps.erreurs ?? {});
    }
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<DemandeDetail>(response, messageIndisponible);
};

export const recupererFdrPdf = async (demandeId: string): Promise<Blob> => {
  const messageIndisponible = "Impossible de récupérer le document PDF.";
  const response = await requeteAuthentifiee(`/demandes/${demandeId}/fdr-pdf/`);
  if (response.status === 404) {
    throw new ErreurReseauOuServeur("Aucun document n'est disponible pour cette demande.");
  }
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return response.blob();
};
