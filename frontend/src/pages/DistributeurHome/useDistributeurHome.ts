import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { TAILLE_PAGE, type FiltreComplements, type FiltreDecision, type StatutDemande } from "../../api/demandes";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { parseFiltresListe } from "../../features/demandes/helpers/parseFiltresListe";
import { telechargerPdf } from "../../features/demandes/helpers/pdfActions";
import { useDemandes, useSupprimerDemande, useTelechargerAttestationFinale } from "../../features/demandes/queries";
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

  const filtres = parseFiltresListe(searchParams);
  const { page } = filtres;
  const { data, isLoading, isError, error, refetch } = useDemandes(filtres);
  const supprimerDemandeMutation = useSupprimerDemande();
  const attestationMutation = useTelechargerAttestationFinale();

  const demandes = data?.results ?? [];
  const total = data?.count ?? 0;
  const nombreDePages = Math.max(1, Math.ceil(total / TAILLE_PAGE));

  const changerFiltre = (cle: "statut" | "decision" | "complements", valeur: string) => {
    setSearchParams((precedent) => {
      const suivant = new URLSearchParams(precedent);
      if (valeur) {
        suivant.set(cle, valeur);
      } else {
        suivant.delete(cle);
      }
      suivant.delete("page");
      return suivant;
    });
  };

  const telechargerAttestation = (demandeId: string) => {
    attestationMutation.mutate(demandeId, {
      onSuccess: (blob) => telechargerPdf(blob, `attestation-definitive-${demandeId}.pdf`),
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
    filtres,
    aucunFiltre: !filtres.statut && !filtres.decision && !filtres.complements,
    page,
    nombreDePages,
    demandes,
    isLoading,
    messageSucces,
    fermerMessageSucces: () => setMessageSucces(null),
    erreurChargement: isError ? messageErreurAffichable(error) : null,
    reessayerChargement: () => refetch(),
    changerStatut: (statut: StatutDemande | "") => changerFiltre("statut", statut),
    changerDecision: (decision: FiltreDecision | "") => changerFiltre("decision", decision),
    changerComplements: (complements: FiltreComplements | "") => changerFiltre("complements", complements),
    changerPage,
    telechargerAttestation,
    attestationEnCours: attestationMutation.isPending,
    erreurAttestation: attestationMutation.isError ? messageErreurAffichable(attestationMutation.error) : null,
    fermerErreurAttestation: () => attestationMutation.reset(),
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
