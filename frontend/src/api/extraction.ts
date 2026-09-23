import type { TypeChantier, TypeIntervention, UsageChantier } from "./demandes";
import { ErreurReseauOuServeur, lireJson } from "./http";
import { requeteAuthentifiee } from "./httpAuthentifie";

export type ChampExtractibleFdr =
  | "assure_nom"
  | "assure_ville"
  | "assure_numero_contrat"
  | "chantier_nom"
  | "chantier_ville"
  | "type_chantier"
  | "usage"
  | "usage_autre_texte"
  | "date_debut"
  | "date_fin"
  | "montant_total"
  | "intervention_description"
  | "intervention_montant_prestation"
  | "intervention_type";

export interface ChampExtrait<T> {
  valeur: T;
  confiance: number;
  page: number | null;
  extrait_source: string | null;
}

/**
 * Reflète exactement `ResultatExtractionFdr` (backend/demandes/extraction_fdr.py).
 * Les montants sont des `number` JSON (Decimal sérialisé nu par DRF), pas des
 * chaînes comme dans `FormulaireRisqueApi`.
 */
export interface ResultatExtractionFdrApi {
  assure_nom: ChampExtrait<string> | null;
  assure_ville: ChampExtrait<string> | null;
  assure_numero_contrat: ChampExtrait<string> | null;
  chantier_nom: ChampExtrait<string> | null;
  chantier_ville: ChampExtrait<string> | null;
  type_chantier: ChampExtrait<TypeChantier> | null;
  usage: ChampExtrait<UsageChantier> | null;
  usage_autre_texte: ChampExtrait<string> | null;
  date_debut: ChampExtrait<string> | null;
  date_fin: ChampExtrait<string> | null;
  montant_total: ChampExtrait<number> | null;
  intervention_description: ChampExtrait<string> | null;
  intervention_montant_prestation: ChampExtrait<number> | null;
  intervention_type: ChampExtrait<TypeIntervention> | null;
  champs_non_trouves: ChampExtractibleFdr[];
}

/** Document rejeté (400) : PDF absent, vide, ou de type MIME incorrect. */
export class ErreurDocumentInvalide extends Error {}

/** Service d'extraction en panne (503) : distinct d'un résultat trouvant 0 champ (200). */
export class ErreurExtractionIndisponible extends Error {}

export const extraireDocumentFdr = async (fichier: File): Promise<ResultatExtractionFdrApi> => {
  const messageIndisponible = "Impossible d'analyser ce document.";
  const formData = new FormData();
  formData.append("document", fichier);

  const response = await requeteAuthentifiee("/demandes/extraire-document/", {
    method: "POST",
    body: formData,
  });

  if (response.status === 400) {
    const corps = await lireJson<Record<string, string[] | undefined>>(response, messageIndisponible);
    const premiereErreur = Object.values(corps)[0]?.[0];
    throw new ErreurDocumentInvalide(premiereErreur ?? messageIndisponible);
  }
  if (response.status === 503) {
    const corps = await lireJson<{ detail?: string }>(response, messageIndisponible);
    throw new ErreurExtractionIndisponible(corps.detail ?? messageIndisponible);
  }
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<ResultatExtractionFdrApi>(response, messageIndisponible);
};
