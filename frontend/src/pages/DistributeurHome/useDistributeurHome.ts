import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { TAILLE_PAGE, type StatutDemande } from "../../api/demandes";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { parseFiltresListe } from "../../features/demandes/helpers/parseFiltresListe";
import { useDemandes, useSupprimerDemande } from "../../features/demandes/queries";
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
  const supprimerDemandeMutation = useSupprimerDemande();

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

  const [demandeASupprimer, setDemandeASupprimer] = useState<string | null>(null);

  const confirmerSuppression = () => {
    if (!demandeASupprimer) {
      return;
    }
    supprimerDemandeMutation.mutate(demandeASupprimer, {
      onSuccess: () => {
        setDemandeASupprimer(null);
        setMessageSucces("Brouillon supprimé.");
      },
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
    creerDemande: () => navigate("/distributeur/demandes/nouvelle"),

    demandeASupprimer,
    ouvrirSuppression: (id: string) => setDemandeASupprimer(id),
    annulerSuppression: () => {
      setDemandeASupprimer(null);
      supprimerDemandeMutation.reset();
    },
    confirmerSuppression,
    suppressionEnCours: supprimerDemandeMutation.isPending,
    erreurSuppression: supprimerDemandeMutation.isError
      ? messageErreurAffichable(supprimerDemandeMutation.error)
      : null,
    fermerErreurSuppression: () => supprimerDemandeMutation.reset(),
  };
};
