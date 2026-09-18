import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { ErreurDemandeIntrouvable } from "../../api/demandes";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { ouvrirPdfDansUnNouvelOnglet, telechargerPdf } from "../../features/demandes/helpers/pdfActions";
import { useDemande, useTelechargerFdrPdf } from "../../features/demandes/queries";
import { useDocumentTitle } from "../../layout/useDocumentTitle";

interface EtatNavigationConsultation {
  successMessage?: string;
}

export const useDemandeConsultationPage = () => {
  const { id } = useParams<{ id: string }>();
  const demandeId = id as string;
  const navigate = useNavigate();
  const location = useLocation();

  useDocumentTitle("Consultation de la demande");

  const etatNavigation = location.state as EtatNavigationConsultation | null;
  const [messageSucces, setMessageSucces] = useState<string | null>(etatNavigation?.successMessage ?? null);
  const nettoyageEffectueRef = useRef(false);
  useEffect(() => {
    if (nettoyageEffectueRef.current) {
      return;
    }
    nettoyageEffectueRef.current = true;
    if (etatNavigation?.successMessage) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [etatNavigation?.successMessage, location.pathname, navigate]);

  const demandeQuery = useDemande(demandeId);
  const telechargerPdfMutation = useTelechargerFdrPdf(demandeId);

  const previsualiser = () => {
    telechargerPdfMutation.mutate(undefined, { onSuccess: ouvrirPdfDansUnNouvelOnglet });
  };

  const telecharger = () => {
    telechargerPdfMutation.mutate(undefined, {
      onSuccess: (blob) => telechargerPdf(blob, `FDR-${demandeId}.pdf`),
    });
  };

  const introuvable = demandeQuery.error instanceof ErreurDemandeIntrouvable;

  return {
    isLoading: demandeQuery.isLoading,
    introuvable,
    erreurChargement: demandeQuery.isError && !introuvable ? messageErreurAffichable(demandeQuery.error) : null,
    reessayerChargement: () => demandeQuery.refetch(),
    demande: demandeQuery.data,

    messageSucces,
    fermerMessageSucces: () => setMessageSucces(null),

    previsualiser,
    telecharger,
    pdfEnCours: telechargerPdfMutation.isPending,
    erreurPdf: telechargerPdfMutation.isError ? messageErreurAffichable(telechargerPdfMutation.error) : null,
    fermerErreurPdf: () => telechargerPdfMutation.reset(),

    retournerAuxDemandes: () => navigate("/distributeur"),
  };
};
