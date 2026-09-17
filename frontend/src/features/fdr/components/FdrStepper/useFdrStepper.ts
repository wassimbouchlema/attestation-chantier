import { useLocation, useNavigate, useParams } from "react-router-dom";

/**
 * Étapes 1/2 pilotées par la route courante (`useLocation`) plutôt que par
 * une prop : `FdrStepper` est rendu une seule fois par `FdrWizardLayout`, en
 * dehors de l'`<Outlet>`, donc en dehors du re-render par page enfant — lire
 * l'URL directement évite de faire remonter un état d'étape jusqu'au layout.
 * `useParams` fonctionne ici car ce composant est rendu dans l'arbre de la
 * route `/distributeur/demandes/:id`, même sans être lui-même routé.
 */
export const useFdrStepper = () => {
  const { id } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const surPieces = pathname.endsWith("/pieces");
  const hrefInformations = `/distributeur/demandes/${id}/informations`;

  return {
    modeInformations: surPieces ? "link" : "active",
    hrefInformations: surPieces ? hrefInformations : undefined,
    allerAuxInformations: surPieces ? () => navigate(hrefInformations) : undefined,
    modePieces: surPieces ? "active" : "disabled",
  } as const;
};
