const URL_COMMUNES = "https://geo.api.gouv.fr/communes";
const LIMITE_RESULTATS = 8;

export interface CommuneSuggestion {
  nom: string;
  codePostal: string;
}

interface CommuneApi {
  nom: string;
  codesPostaux?: string[];
}

/** API publique geo.api.gouv.fr : pas d'authentification applicative, donc pas de `requeteAuthentifiee`. */
export const rechercherCommunes = async (terme: string, signal?: AbortSignal): Promise<CommuneSuggestion[]> => {
  const params = new URLSearchParams({
    nom: terme,
    fields: "nom,codesPostaux",
    boost: "population",
    limit: String(LIMITE_RESULTATS),
  });
  const response = await fetch(`${URL_COMMUNES}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error("Recherche de communes indisponible.");
  }
  const communes = (await response.json()) as CommuneApi[];
  return communes.map((commune) => ({ nom: commune.nom, codePostal: commune.codesPostaux?.[0] ?? "" }));
};
