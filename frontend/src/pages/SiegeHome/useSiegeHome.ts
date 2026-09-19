import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { TAILLE_PAGE } from "../../api/demandes";
import { parseFiltresListe } from "../../features/demandes/helpers/parseFiltresListe";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { useDemandesSiege } from "../../features/siege/queries";
import { useDocumentTitle } from "../../layout/useDocumentTitle";

export const useSiegeHome = () => {
  useDocumentTitle("Demandes à traiter");
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const etatNavigation = location.state as { successMessage?: string } | null;
  const [messageSucces, setMessageSucces] = useState(etatNavigation?.successMessage ?? null);

  useEffect(() => {
    if (etatNavigation?.successMessage) {
      navigate(location.pathname + location.search, { replace: true, state: null });
    }
  }, [etatNavigation?.successMessage, location.pathname, location.search, navigate]);

  const { page } = parseFiltresListe(searchParams);
  const { data, isLoading, isError, error, refetch } = useDemandesSiege(page);

  const demandes = data?.results ?? [];
  const total = data?.count ?? 0;
  const nombreDePages = Math.max(1, Math.ceil(total / TAILLE_PAGE));

  const changerPage = (nouvellePage: number) => {
    setSearchParams((precedent) => {
      const suivant = new URLSearchParams(precedent);
      if (nouvellePage > 1) {
        suivant.set("page", String(nouvellePage));
      } else {
        suivant.delete("page");
      }
      return suivant;
    });
  };

  return {
    messageSucces,
    fermerMessageSucces: () => setMessageSucces(null),
    page,
    nombreDePages,
    demandes,
    isLoading,
    erreurChargement: isError ? messageErreurAffichable(error) : null,
    reessayerChargement: () => refetch(),
    changerPage,
  };
};
