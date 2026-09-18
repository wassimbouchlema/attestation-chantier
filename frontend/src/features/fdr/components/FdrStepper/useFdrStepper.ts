import { useLocation, useNavigate, useParams } from "react-router-dom";

export const useFdrStepper = () => {
  const { id } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const etape = pathname.endsWith("/validation") ? "validation" : pathname.endsWith("/pieces") ? "pieces" : "informations";

  const hrefInformations = `/distributeur/demandes/${id}/informations`;
  const hrefPieces = `/distributeur/demandes/${id}/pieces`;

  const avantInformations = etape !== "informations";
  const avantPieces = etape === "validation";

  return {
    modeInformations: etape === "informations" ? "active" : "link",
    hrefInformations: avantInformations ? hrefInformations : undefined,
    allerAuxInformations: avantInformations ? () => navigate(hrefInformations) : undefined,

    modePieces: etape === "pieces" ? "active" : avantPieces ? "link" : "disabled",
    hrefPieces: avantPieces ? hrefPieces : undefined,
    allerAuxPieces: avantPieces ? () => navigate(hrefPieces) : undefined,

    modeValidation: etape === "validation" ? "active" : "disabled",
  } as const;
};
