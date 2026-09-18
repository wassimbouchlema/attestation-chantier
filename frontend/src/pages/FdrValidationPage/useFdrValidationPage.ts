import { useEffect, useMemo, useRef, useState } from "react";

import { useNavigate } from "react-router-dom";

import type { DemandeDetail } from "../../api/demandes";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { decrireErreurEnvoi } from "../../features/fdr/helpers/decrireErreurEnvoi";
import { useEnvoyerDemande, useSauvegarderCommentaire } from "../../features/fdr/queries";
import { useDocumentTitle } from "../../layout/useDocumentTitle";

export const useFdrValidationPage = (demande: DemandeDetail) => {
  const navigate = useNavigate();
  const lectureSeule = demande.statut !== "BROUILLON";

  useDocumentTitle("Validation & envoi — Formulaire de déclaration du risque");

  const [commentaire, setCommentaire] = useState(demande.commentaire_distributeur);
  const demandeInitialiseeRef = useRef<string | null>(null);
  useEffect(() => {
    if (demandeInitialiseeRef.current === demande.id) {
      return;
    }
    demandeInitialiseeRef.current = demande.id;
    setCommentaire(demande.commentaire_distributeur);
  }, [demande.id, demande.commentaire_distributeur]);

  const sauvegarderCommentaireMutation = useSauvegarderCommentaire(demande.id);
  const envoyerMutation = useEnvoyerDemande(demande.id);

  const modifierCommentaire = (valeur: string) => {
    setCommentaire(valeur);
    if (sauvegarderCommentaireMutation.isError) {
      sauvegarderCommentaireMutation.reset();
    }
  };

  const enregistrerBrouillon = () => {
    sauvegarderCommentaireMutation.mutate(commentaire, {
      onSuccess: () =>
        navigate("/distributeur", {
          state: { successMessage: "Demande enregistrée en brouillon. Vous pourrez la reprendre ultérieurement." },
        }),
    });
  };

  const envoyer = () => {
    envoyerMutation.mutate(commentaire, {
      onSuccess: () =>
        navigate(`/distributeur/demandes/${demande.id}/consultation`, {
          state: { successMessage: "Demande envoyée au siège. Votre demande est désormais en cours de traitement." },
        }),
    });
  };

  const erreurEnvoi = useMemo(
    () => (envoyerMutation.isError ? decrireErreurEnvoi(envoyerMutation.error) : null),
    [envoyerMutation.isError, envoyerMutation.error],
  );

  return {
    lectureSeule,
    fdr: demande.fdr,
    commentaire,
    modifierCommentaire,

    enregistrerBrouillon,
    enregistrementEnCours: sauvegarderCommentaireMutation.isPending,
    erreurSauvegarde: sauvegarderCommentaireMutation.isError
      ? messageErreurAffichable(sauvegarderCommentaireMutation.error)
      : null,
    fermerErreurSauvegarde: () => sauvegarderCommentaireMutation.reset(),

    envoyer,
    envoiEnCours: envoyerMutation.isPending,
    erreurEnvoi,
    fermerErreurEnvoi: () => envoyerMutation.reset(),

    retourner: () => navigate(`/distributeur/demandes/${demande.id}/pieces`),
  };
};
