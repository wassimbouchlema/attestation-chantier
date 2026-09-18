import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../features/auth/useAuth";
import { useDemande } from "../../features/demandes/queries";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { ouvrirPdfDansUnNouvelOnglet, telechargerPdf } from "../../features/demandes/helpers/pdfActions";
import {
  useProjetAttestation,
  useSauvegarderProjetAttestation,
  useTelechargerProjetAttestationPdf,
} from "../../features/projetAttestation/queries";
import { useDocumentTitle } from "../../layout/useDocumentTitle";

export const useProjetAttestationPage = () => {
  const { id } = useParams<{ id: string }>();
  const demandeId = id as string;
  const navigate = useNavigate();

  useDocumentTitle("Projet d'attestation");

  const { utilisateur } = useAuth();
  const demandeQuery = useDemande(demandeId);
  const projetQuery = useProjetAttestation(demandeId);
  const sauvegarderMutation = useSauvegarderProjetAttestation(demandeId);
  const pdfMutation = useTelechargerProjetAttestationPdf(demandeId);

  const contenuCourantRef = useRef<string | null>(null);

  // `dirty` en state, lui, car il change l'UI (mention de modifications non
  // enregistrées). L'écouteur Quill n'étant branché qu'après l'hydratation
  // initiale, le préremplissage ne marque pas le document comme modifié —
  // seule une action de l'utilisateur le fait. Repasse à false après un PATCH
  // réussi : la dernière version enregistrée redevient la référence.
  const [dirty, setDirty] = useState(false);

  const modifierContenu = (html: string) => {
    contenuCourantRef.current = html;
    setDirty(true);
  };

  const [messageSucces, setMessageSucces] = useState<string | null>(null);

  const enregistrer = () => {
    const contenu = contenuCourantRef.current ?? projetQuery.data?.contenu_html ?? "";
    sauvegarderMutation.mutate(contenu, {
      onSuccess: () => {
        setDirty(false);
        setMessageSucces("Projet d'attestation enregistré.");
      },
    });
  };

  // Le PDF rend la dernière version enregistrée : tant que des modifications
  // locales n'ont pas été sauvegardées, les actions PDF restent fermées — un
  // enregistrement automatique à leur place masquerait cette différence.
  const previsualiser = () => {
    pdfMutation.mutate(undefined, { onSuccess: ouvrirPdfDansUnNouvelOnglet });
  };

  const telecharger = () => {
    pdfMutation.mutate(undefined, {
      onSuccess: (blob) => telechargerPdf(blob, `projet-attestation-${demandeId}.pdf`),
    });
  };

  return {
    isLoading: projetQuery.isLoading || demandeQuery.isLoading,
    introuvable: projetQuery.isSuccess && projetQuery.data === null,
    erreurChargement: projetQuery.isError
      ? messageErreurAffichable(projetQuery.error)
      : demandeQuery.isError
        ? messageErreurAffichable(demandeQuery.error)
        : null,
    reessayerChargement: () => {
      projetQuery.refetch();
      demandeQuery.refetch();
    },
    projet: projetQuery.data,
    // Données du gabarit (non éditable) : n'existent que lorsque le projet ET
    // la demande sont réellement chargés — jamais de rendu avec une valeur
    // par défaut/partielle le temps du chargement (voir `ProjetAttestationPage`).
    demande: demandeQuery.data,
    agent: utilisateur,

    modifierContenu,
    dirty,
    enregistrer,
    enregistrementEnCours: sauvegarderMutation.isPending,
    erreurEnregistrement: sauvegarderMutation.isError ? messageErreurAffichable(sauvegarderMutation.error) : null,
    fermerErreurEnregistrement: () => sauvegarderMutation.reset(),

    previsualiser,
    telecharger,
    pdfEnCours: pdfMutation.isPending,
    pdfDisabled: dirty || pdfMutation.isPending,
    erreurPdf: pdfMutation.isError ? messageErreurAffichable(pdfMutation.error) : null,
    fermerErreurPdf: () => pdfMutation.reset(),

    messageSucces,
    fermerMessageSucces: () => setMessageSucces(null),

    retournerADemande: () => navigate(`/distributeur/demandes/${demandeId}/consultation`),
  };
};
