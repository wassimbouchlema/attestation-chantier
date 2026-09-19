import { useNavigate, useParams } from "react-router-dom";

import { ErreurDemandeIntrouvable } from "../../api/demandes";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { ouvrirPdfDansUnNouvelOnglet, telechargerPdf } from "../../features/demandes/helpers/pdfActions";
import { useDemandeSiege, useTelechargerFdrPdfSiege } from "../../features/siege/queries";
import { useDocumentTitle } from "../../layout/useDocumentTitle";

export const useSiegeDemandeConsultationPage = () => {
  const { id } = useParams<{ id: string }>();
  const demandeId = id as string;
  const navigate = useNavigate();

  useDocumentTitle("Consultation de la demande");

  const demandeQuery = useDemandeSiege(demandeId);
  const telechargerPdfMutation = useTelechargerFdrPdfSiege(demandeId);

  const previsualiser = () => {
    telechargerPdfMutation.mutate(undefined, { onSuccess: ouvrirPdfDansUnNouvelOnglet });
  };

  const telecharger = () => {
    telechargerPdfMutation.mutate(undefined, {
      onSuccess: (blob) => telechargerPdf(blob, `FDR-${demandeId}.pdf`),
    });
  };

  const introuvable = demandeQuery.error instanceof ErreurDemandeIntrouvable;
  const demande = demandeQuery.data;

  return {
    isLoading: demandeQuery.isLoading,
    introuvable,
    erreurChargement: demandeQuery.isError && !introuvable ? messageErreurAffichable(demandeQuery.error) : null,
    reessayerChargement: () => demandeQuery.refetch(),
    demande,

    previsualiser,
    telecharger,
    pdfEnCours: telechargerPdfMutation.isPending,
    erreurPdf: telechargerPdfMutation.isError ? messageErreurAffichable(telechargerPdfMutation.error) : null,
    fermerErreurPdf: () => telechargerPdfMutation.reset(),

    retournerAuxDemandes: () => navigate("/siege"),
  };
};
