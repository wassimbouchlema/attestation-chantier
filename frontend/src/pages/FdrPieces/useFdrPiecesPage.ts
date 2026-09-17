import { useNavigate } from "react-router-dom";

import type { DemandeDetail } from "../../api/demandes";
import { useDocumentTitle } from "../../layout/useDocumentTitle";

/** Orchestration de FdrPiecesPage : lectureSeule, titre de document, navigation de retour. */
export const useFdrPiecesPage = (demande: DemandeDetail) => {
  const navigate = useNavigate();
  const lectureSeule = demande.statut !== "BROUILLON";

  useDocumentTitle("Pièces & risque — Formulaire de déclaration du risque");

  return {
    lectureSeule,
    retournerAuxInformations: () => navigate(`/distributeur/demandes/${demande.id}/informations`),
  };
};
