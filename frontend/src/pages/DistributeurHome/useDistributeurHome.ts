import { useNavigate, useSearchParams } from "react-router-dom";

import { TAILLE_PAGE, type StatutDemande } from "../../api/demandes";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { parseFiltresListe } from "../../features/demandes/helpers/parseFiltresListe";
import { useCreerDemande, useDemandes } from "../../features/demandes/queries";
import { useDocumentTitle } from "../../layout/useDocumentTitle";

/** Orchestration de l'écran Mes demandes : filtre/pagination (URL), liste, création. */
export const useDistributeurHome = () => {
  useDocumentTitle("Mes demandes");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { statut, page } = parseFiltresListe(searchParams);
  const { data, isLoading, isError, error, refetch } = useDemandes({ statut, page });
  const creerDemandeMutation = useCreerDemande();

  const demandes = data?.results ?? [];
  const total = data?.count ?? 0;
  const nombreDePages = Math.max(1, Math.ceil(total / TAILLE_PAGE));

  const changerStatut = (nouveauStatut: StatutDemande | "") => {
    setSearchParams((precedent) => {
      const suivant = new URLSearchParams(precedent);
      if (nouveauStatut) {
        suivant.set("statut", nouveauStatut);
      } else {
        suivant.delete("statut");
      }
      suivant.delete("page");
      return suivant;
    });
  };

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

  const creerDemande = () => {
    if (creerDemandeMutation.isPending) {
      return;
    }
    creerDemandeMutation.mutate(undefined, {
      onSuccess: (demande) => navigate(`/distributeur/demandes/${demande.id}`),
    });
  };

  return {
    statutSelectionne: statut,
    page,
    nombreDePages,
    demandes,
    isLoading,
    erreurChargement: isError ? messageErreurAffichable(error) : null,
    reessayerChargement: () => refetch(),
    changerStatut,
    changerPage,
    creerDemande,
    creationEnCours: creerDemandeMutation.isPending,
    erreurCreation: creerDemandeMutation.isError ? messageErreurAffichable(creerDemandeMutation.error) : null,
    fermerErreurCreation: () => creerDemandeMutation.reset(),
  };
};
