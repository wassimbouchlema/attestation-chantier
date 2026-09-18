import { useFormContext } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import type { DemandeDetail } from "../../api/demandes";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { versPayloadApi } from "../../features/fdr/helpers/versPayloadApi";
import { useFdrSectionsEtat } from "../../features/fdr/hooks/useFdrSectionsEtat";
import { useMettreAJourFdr } from "../../features/fdr/queries";
import type { FdrFormValues } from "../../features/fdr/types/FdrFormValues";
import { useDocumentTitle } from "../../layout/useDocumentTitle";

export const useFdrInformationsPage = (demande: DemandeDetail) => {
  const navigate = useNavigate();
  const lectureSeule = demande.statut !== "BROUILLON";
  const methods = useFormContext<FdrFormValues>();
  const mettreAJourFdrMutation = useMettreAJourFdr(demande.id);

  useDocumentTitle("Informations — Formulaire de déclaration du risque");

  const { etatDe, modifierSection, validerSection, erreurValidationGlobale, fermerErreurValidationGlobale, verifierEtValider } =
    useFdrSectionsEtat({ identifiant: demande.id, lectureSeule, methods });

  const confirmerInformations = () =>
    verifierEtValider(() => {
      mettreAJourFdrMutation.mutate(versPayloadApi(methods.getValues()), {
        onSuccess: () => navigate(`/distributeur/demandes/${demande.id}/pieces`),
      });
    });

  return {
    lectureSeule,
    etatDe,
    modifierSection,
    validerSection,
    erreurValidationGlobale,
    fermerErreurValidationGlobale,
    erreurConfirmation: mettreAJourFdrMutation.isError ? messageErreurAffichable(mettreAJourFdrMutation.error) : null,
    fermerErreurConfirmation: () => mettreAJourFdrMutation.reset(),
    confirmationEnCours: mettreAJourFdrMutation.isPending,
    confirmerInformations,
    retournerAuxDemandes: () => navigate("/distributeur"),
  };
};
