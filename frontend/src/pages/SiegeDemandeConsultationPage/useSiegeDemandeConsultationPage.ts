import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ErreurDemandeIntrouvable } from "../../api/demandes";
import type { TraitementSiege } from "../../api/siege";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { ouvrirPdfDansUnNouvelOnglet, telechargerPdf } from "../../features/demandes/helpers/pdfActions";
import { useDemandeSiege, useTelechargerFdrPdfSiege, useTraiterDemandeSiege } from "../../features/siege/queries";
import { useDocumentTitle } from "../../layout/useDocumentTitle";

export const useSiegeDemandeConsultationPage = () => {
  const { id } = useParams<{ id: string }>();
  const demandeId = id as string;
  const navigate = useNavigate();

  useDocumentTitle("Consultation de la demande");

  const demandeQuery = useDemandeSiege(demandeId);
  const telechargerPdfMutation = useTelechargerFdrPdfSiege(demandeId);
  const traitementMutation = useTraiterDemandeSiege(demandeId);
  const [actionTraitement, setActionTraitement] = useState<TraitementSiege["action"] | null>(null);
  const [texteTraitement, setTexteTraitement] = useState("");
  const [erreurSaisie, setErreurSaisie] = useState<string | null>(null);
  const [messageSucces, setMessageSucces] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (actionTraitement) dialogRef.current?.showModal();
  }, [actionTraitement]);

  const ouvrirTraitement = (action: TraitementSiege["action"]) => {
    traitementMutation.reset();
    setErreurSaisie(null);
    setTexteTraitement("");
    setActionTraitement(action);
  };

  const fermerTraitement = () => {
    if (!traitementMutation.isPending) setActionTraitement(null);
  };

  const confirmerTraitement = () => {
    const texte = texteTraitement.trim();
    if (!texte) {
      setErreurSaisie(actionTraitement === "refuser" ? "Le motif est obligatoire." : "Le message est obligatoire.");
      return;
    }
    if (!actionTraitement || traitementMutation.isPending) return;
    traitementMutation.mutate(
      actionTraitement === "refuser"
        ? { action: "refuser", motif: texte }
        : { action: "demander-complements", message: texte },
      {
        onSuccess: () => {
          setActionTraitement(null);
          if (actionTraitement === "refuser") {
            navigate("/siege", { state: { successMessage: "Demande refusée." } });
          } else {
            setMessageSucces("La demande de compléments a été envoyée au distributeur.");
          }
        },
      },
    );
  };

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
    traitable: demande?.statut === "EN_COURS" && demande.decision === null && !demande.complement_actif,
    actionTraitement,
    ouvrirTraitement,
    fermerTraitement,
    confirmerTraitement,
    texteTraitement,
    changerTexteTraitement: (texte: string) => {
      setTexteTraitement(texte);
      setErreurSaisie(null);
    },
    erreurSaisie,
    erreurTraitement: traitementMutation.isError ? messageErreurAffichable(traitementMutation.error) : null,
    traitementEnCours: traitementMutation.isPending,
    dialogRef,
    messageSucces,
    fermerMessageSucces: () => setMessageSucces(null),

    previsualiser,
    telecharger,
    pdfEnCours: telechargerPdfMutation.isPending,
    erreurPdf: telechargerPdfMutation.isError ? messageErreurAffichable(telechargerPdfMutation.error) : null,
    fermerErreurPdf: () => telechargerPdfMutation.reset(),

    retournerAuxDemandes: () => navigate("/siege"),
  };
};
