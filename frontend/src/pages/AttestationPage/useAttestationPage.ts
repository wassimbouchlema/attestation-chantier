import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type { ResultatCoherenceApi } from "../../api/attestation";
import { useAnalyserCoherence, useAttestation, useAttestationPdf, useSauvegarderAttestation, useValiderAttestation } from "../../features/attestation/queries";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { ouvrirPdfDansUnNouvelOnglet, telechargerPdf } from "../../features/demandes/helpers/pdfActions";
import { useDemandeSiege } from "../../features/siege/queries";
import { useDocumentTitle } from "../../layout/useDocumentTitle";
import { useMessageTemporaire } from "../../layout/useMessageTemporaire";

export const useAttestationPage = () => {
  const { id } = useParams<{ id: string }>();
  const demandeId = id as string;
  const navigate = useNavigate();
  useDocumentTitle("Préparation d'attestation");
  const demandeQuery = useDemandeSiege(demandeId);
  const attestationQuery = useAttestation(demandeId);
  const sauvegarde = useSauvegarderAttestation(demandeId);
  const pdf = useAttestationPdf(demandeId);
  const contenuRef = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const feedback = useMessageTemporaire();
  const analyse = useAnalyserCoherence(demandeId);
  const validation = useValiderAttestation(demandeId);
  const [confirmationOuverte, setConfirmationOuverte] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (confirmationOuverte) dialogRef.current?.showModal();
  }, [confirmationOuverte]);
  const revision = useRef(0);
  const [controle, setControle] = useState<{
    resultat: ResultatCoherenceApi;
    contenu: string;
    updatedAt: string;
    demandeId: string;
  } | null>(null);
  const [erreurAnalyse, setErreurAnalyse] = useState<string | null>(null);
  const analyseDisabled = dirty || sauvegarde.isPending || analyse.isPending
    || !attestationQuery.data || attestationQuery.data.validated_at !== null
    || demandeQuery.data?.statut !== "EN_COURS" || demandeQuery.data?.decision !== null;

  const analyser = () => {
    const document = attestationQuery.data;
    if (analyseDisabled || !document) return;
    const revisionAnalysee = revision.current;
    setControle(null);
    setErreurAnalyse(null);
    analyse.mutate(undefined, {
      onSuccess: (resultat) => {
        if (revision.current === revisionAnalysee) {
          setControle({ resultat, contenu: document.contenu_html, updatedAt: document.updated_at, demandeId });
        }
      },
      onError: (error) => {
        if (revision.current === revisionAnalysee) setErreurAnalyse(messageErreurAffichable(error));
      },
    });
  };

  const validationDisabled = dirty || sauvegarde.isPending || validation.isPending
    || !attestationQuery.data || attestationQuery.data.validated_at !== null
    || demandeQuery.data?.statut !== "EN_COURS" || demandeQuery.data?.decision !== null;

  const fermerConfirmation = () => {
    if (!validation.isPending) setConfirmationOuverte(false);
  };

  const confirmerValidation = () => {
    if (validationDisabled) return;
    validation.mutate(undefined, {
      onSuccess: () => {
        setConfirmationOuverte(false);
        navigate("/siege", { state: { successMessage: "Demande acceptée et attestation définitive générée." } });
      },
      onError: () => setConfirmationOuverte(false),
    });
  };

  const enregistrer = () => {
    if (sauvegarde.isPending) return;
    sauvegarde.mutate(contenuRef.current ?? attestationQuery.data?.contenu_html ?? "", {
      onSuccess: (document) => {
        contenuRef.current = document.contenu_html;
        setDirty(false);
        feedback.afficher("Attestation enregistrée.");
      },
    });
  };

  return {
    demande: demandeQuery.data,
    attestation: attestationQuery.data,
    isLoading: demandeQuery.isLoading || attestationQuery.isLoading,
    introuvable: attestationQuery.isSuccess && attestationQuery.data === null,
    erreurChargement: demandeQuery.error || attestationQuery.error
      ? messageErreurAffichable(demandeQuery.error ?? attestationQuery.error) : null,
    reessayer: () => {
      void demandeQuery.refetch();
      void attestationQuery.refetch();
    },
    modifierContenu: (html: string) => {
      revision.current += 1;
      setControle(null);
      setErreurAnalyse(null);
      contenuRef.current = html;
      setDirty(true);
      feedback.fermer();
    },
    dirty,
    analyser,
    analyseDisabled,
    analyseEnCours: analyse.isPending,
    erreurAnalyse,
    resultatAnalyse: !dirty && controle?.demandeId === demandeId
      && controle.contenu === attestationQuery.data?.contenu_html
      && controle.updatedAt === attestationQuery.data?.updated_at ? controle.resultat : null,
    validationDisabled,
    validationEnCours: validation.isPending,
    erreurValidation: validation.isError ? messageErreurAffichable(validation.error) : null,
    confirmationOuverte,
    dialogRef,
    ouvrirConfirmation: () => {
      if (validationDisabled) return;
      validation.reset();
      setConfirmationOuverte(true);
    },
    fermerConfirmation,
    confirmerValidation,
    enregistrer,
    enregistrementEnCours: sauvegarde.isPending,
    erreurEnregistrement: sauvegarde.isError ? messageErreurAffichable(sauvegarde.error) : null,
    messageSucces: feedback.message,
    fermerMessageSucces: feedback.fermer,
    pdfDisabled: dirty || sauvegarde.isPending || pdf.isPending || validation.isPending,
    erreurPdf: pdf.isError ? messageErreurAffichable(pdf.error) : null,
    previsualiser: () => {
      if (!dirty && !sauvegarde.isPending && !pdf.isPending) {
        pdf.mutate(undefined, { onSuccess: ouvrirPdfDansUnNouvelOnglet });
      }
    },
    telecharger: () => {
      if (!dirty && !sauvegarde.isPending && !pdf.isPending) {
        pdf.mutate(undefined, {
          onSuccess: (blob) => telechargerPdf(blob, `preparation-attestation-${demandeId}.pdf`),
        });
      }
    },
    retourner: () => navigate(`/siege/demandes/${demandeId}`),
  };
};
