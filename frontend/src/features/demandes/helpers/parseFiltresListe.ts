import type { StatutDemande } from "../../../api/demandes";

/** Lecture pure des filtres de la liste depuis les search params de l'URL. */
export const parseFiltresListe = (searchParams: URLSearchParams): { statut: StatutDemande | ""; page: number } => {
  const statutBrut = searchParams.get("statut");
  const statut: StatutDemande | "" =
    statutBrut === "BROUILLON" || statutBrut === "EN_COURS" || statutBrut === "TRAITE" ? statutBrut : "";

  const pageBrute = Number(searchParams.get("page"));
  const page = Number.isInteger(pageBrute) && pageBrute > 0 ? pageBrute : 1;

  return { statut, page };
};
