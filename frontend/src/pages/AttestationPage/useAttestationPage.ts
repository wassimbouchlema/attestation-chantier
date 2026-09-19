import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAttestation, useAttestationPdf, useSauvegarderAttestation } from "../../features/attestation/queries";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { ouvrirPdfDansUnNouvelOnglet, telechargerPdf } from "../../features/demandes/helpers/pdfActions";
import { useDemandeSiege } from "../../features/siege/queries";
import { useDocumentTitle } from "../../layout/useDocumentTitle";

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
  const [succes, setSucces] = useState(false);

  const enregistrer = () => {
    if (sauvegarde.isPending) return;
    sauvegarde.mutate(contenuRef.current ?? attestationQuery.data?.contenu_html ?? "", {
      onSuccess: (document) => {
        contenuRef.current = document.contenu_html;
        setDirty(false);
        setSucces(true);
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
      contenuRef.current = html;
      setDirty(true);
      setSucces(false);
    },
    dirty,
    enregistrer,
    enregistrementEnCours: sauvegarde.isPending,
    erreurEnregistrement: sauvegarde.isError ? messageErreurAffichable(sauvegarde.error) : null,
    succes,
    pdfDisabled: dirty || sauvegarde.isPending || pdf.isPending,
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
