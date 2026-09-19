import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type { ResultatCoherenceApi } from "../../api/attestation";
import { useAnalyserCoherence, useAttestation, useAttestationPdf, useSauvegarderAttestation } from "../../features/attestation/queries";
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
  const analyse = useAnalyserCoherence(demandeId);
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
      revision.current += 1;
      setControle(null);
      setErreurAnalyse(null);
      contenuRef.current = html;
      setDirty(true);
      setSucces(false);
    },
    dirty,
    analyser,
    analyseDisabled,
    analyseEnCours: analyse.isPending,
    erreurAnalyse,
    resultatAnalyse: !dirty && controle?.demandeId === demandeId
      && controle.contenu === attestationQuery.data?.contenu_html
      && controle.updatedAt === attestationQuery.data?.updated_at ? controle.resultat : null,
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
