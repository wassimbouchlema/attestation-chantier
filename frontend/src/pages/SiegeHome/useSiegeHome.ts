import { useSearchParams } from "react-router-dom";

import { TAILLE_PAGE } from "../../api/demandes";
import { parseFiltresListe } from "../../features/demandes/helpers/parseFiltresListe";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { useDemandesSiege } from "../../features/siege/queries";
import { useDocumentTitle } from "../../layout/useDocumentTitle";

export const useSiegeHome = () => {
  useDocumentTitle("Demandes à traiter");
  const [searchParams, setSearchParams] = useSearchParams();

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
    page,
    nombreDePages,
    demandes,
    isLoading,
    erreurChargement: isError ? messageErreurAffichable(error) : null,
    reessayerChargement: () => refetch(),
    changerPage,
  };
};
