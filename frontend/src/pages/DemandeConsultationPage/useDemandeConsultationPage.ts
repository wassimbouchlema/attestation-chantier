import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { ErreurDelaiRelanceNonEcoule, ErreurDemandeIntrouvable } from "../../api/demandes";
import { formatDateHeure } from "../../helpers/formatDateHeure";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { ouvrirPdfDansUnNouvelOnglet, telechargerPdf } from "../../features/demandes/helpers/pdfActions";
import { calculerProchaineRelance } from "../../features/demandes/helpers/prochaineRelance";
import { useDemande, useRelancerDemande, useTelechargerFdrPdf } from "../../features/demandes/queries";
import { useAttestationFinalePdf } from "../../features/attestation/queries";
import { useCreerProjetAttestation, useProjetAttestation } from "../../features/projetAttestation/queries";
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
  const relancerMutation = useRelancerDemande(demandeId);

  const previsualiser = () => {
    telechargerPdfMutation.mutate(undefined, { onSuccess: ouvrirPdfDansUnNouvelOnglet });
  };

  const telecharger = () => {
    telechargerPdfMutation.mutate(undefined, {
      onSuccess: (blob) => telechargerPdf(blob, `FDR-${demandeId}.pdf`),
    });
  };

  const relancer = () => {
    relancerMutation.mutate(undefined, {
      onSuccess: () => setMessageSucces("Relance envoyée au siège."),
    });
  };

  const attestationFinalePdf = useAttestationFinalePdf(demandeId);
  const previsualiserAttestationFinale = () => {
    attestationFinalePdf.mutate(undefined, { onSuccess: ouvrirPdfDansUnNouvelOnglet });
  };
  const telechargerAttestationFinale = () => {
    attestationFinalePdf.mutate(undefined, {
      onSuccess: (blob) => telechargerPdf(blob, `attestation-definitive-${demandeId}.pdf`),
    });
  };

  const projetQuery = useProjetAttestation(demandeId);
  const creerProjetMutation = useCreerProjetAttestation(demandeId);
  const creerProjet = () => {
    creerProjetMutation.mutate(undefined, {
      onSuccess: () => navigate(`/distributeur/demandes/${demandeId}/projet-attestation`),
    });
  };

  const introuvable = demandeQuery.error instanceof ErreurDemandeIntrouvable;
  const demande = demandeQuery.data;
  // Anticipation d'affichage uniquement (bouton désactivé, date annoncée) :
  // le backend reste l'unique source de vérité pour l'autorisation réelle.
  const prochaineRelance = demande?.last_relance_at ? calculerProchaineRelance(demande.last_relance_at) : null;
  // oxlint-disable-next-line react/purity
  const relanceEnCooldown = prochaineRelance !== null && Date.now() < prochaineRelance.getTime();

  return {
    isLoading: demandeQuery.isLoading,
    introuvable,
    erreurChargement: demandeQuery.isError && !introuvable ? messageErreurAffichable(demandeQuery.error) : null,
    reessayerChargement: () => demandeQuery.refetch(),
    demande,

    messageSucces,
    fermerMessageSucces: () => setMessageSucces(null),

    previsualiser,
    telecharger,
    pdfEnCours: telechargerPdfMutation.isPending,
    erreurPdf: telechargerPdfMutation.isError ? messageErreurAffichable(telechargerPdfMutation.error) : null,
    fermerErreurPdf: () => telechargerPdfMutation.reset(),

    previsualiserAttestationFinale,
    telechargerAttestationFinale,
    attestationFinaleEnCours: attestationFinalePdf.isPending,
    erreurAttestationFinale: attestationFinalePdf.isError ? messageErreurAffichable(attestationFinalePdf.error) : null,
    fermerErreurAttestationFinale: () => attestationFinalePdf.reset(),

    relancer,
    prochaineRelance,
    relanceEnCours: relancerMutation.isPending,
    relanceDisabled: relancerMutation.isPending || relanceEnCooldown,
    erreurRelance: relancerMutation.isError
      ? relancerMutation.error instanceof ErreurDelaiRelanceNonEcoule
        ? `Une nouvelle relance sera possible le ${formatDateHeure(relancerMutation.error.prochaineRelanceAt)}.`
        : messageErreurAffichable(relancerMutation.error)
      : null,
    fermerErreurRelance: () => relancerMutation.reset(),

    projet: projetQuery.data,
    projetEnChargement: projetQuery.isLoading,
    creerProjet,
    creationProjetEnCours: creerProjetMutation.isPending,
    erreurCreationProjet: creerProjetMutation.isError ? messageErreurAffichable(creerProjetMutation.error) : null,
    fermerErreurCreationProjet: () => creerProjetMutation.reset(),
    modifierProjet: () => navigate(`/distributeur/demandes/${demandeId}/projet-attestation`),

    retournerAuxDemandes: () => navigate("/distributeur"),
  };
};
