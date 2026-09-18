import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { TAILLE_PAGE, type StatutDemande } from "../../api/demandes";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { parseFiltresListe } from "../../features/demandes/helpers/parseFiltresListe";
import { useCreerDemande, useDemandes } from "../../features/demandes/queries";
import { useDocumentTitle } from "../../layout/useDocumentTitle";

interface EtatNavigationDistributeurHome {
  successMessage?: string;
}

export const useDistributeurHome = () => {
  useDocumentTitle("Mes demandes");
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const etatNavigation = location.state as EtatNavigationDistributeurHome | null;
  const [messageSucces, setMessageSucces] = useState<string | null>(etatNavigation?.successMessage ?? null);
  const nettoyageEffectueRef = useRef(false);
  useEffect(() => {
    if (nettoyageEffectueRef.current) {
      return;
    }
    nettoyageEffectueRef.current = true;
    if (etatNavigation?.successMessage) {
      navigate(location.pathname + location.search, { replace: true, state: null });
    }
  }, [etatNavigation?.successMessage, location.pathname, location.search, navigate]);

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
    messageSucces,
    fermerMessageSucces: () => setMessageSucces(null),
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
