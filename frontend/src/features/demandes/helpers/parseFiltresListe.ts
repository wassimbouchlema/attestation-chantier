import type { FiltreComplements, FiltreDecision, StatutDemande } from "../../../api/demandes";

export interface FiltresListe {
  statut: StatutDemande | "";
  decision: FiltreDecision | "";
  complements: FiltreComplements | "";
  page: number;
}

/** Lecture pure des filtres de la liste depuis les search params de l'URL. */
export const parseFiltresListe = (searchParams: URLSearchParams): FiltresListe => {
  const statutBrut = searchParams.get("statut");
  const statut: StatutDemande | "" =
    statutBrut === "BROUILLON" || statutBrut === "EN_COURS" || statutBrut === "TRAITE" ? statutBrut : "";

  const decisionBrute = searchParams.get("decision");
  const decision: FiltreDecision | "" =
    decisionBrute === "ACCEPTEE" || decisionBrute === "REFUSEE" || decisionBrute === "EN_ATTENTE"
      ? decisionBrute
      : "";

  const complementsBruts = searchParams.get("complements");
  const complements: FiltreComplements | "" =
    complementsBruts === "DEMANDES" || complementsBruts === "AUCUN" ? complementsBruts : "";

  const pageBrute = Number(searchParams.get("page"));
  const page = Number.isInteger(pageBrute) && pageBrute > 0 ? pageBrute : 1;

  return { statut, decision, complements, page };
};
