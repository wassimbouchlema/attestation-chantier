import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { ErreurFdrInvalide } from "../../api/demandes";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { useCreerDemandeAvecFdr } from "../../features/demandes/queries";
import { useFdrSectionsEtat } from "../../features/fdr/hooks/useFdrSectionsEtat";
import { fdrInformationsSchema } from "../../features/fdr/schemas/fdrInformationsSchema";
import { FDR_FORM_VALEURS_VIDES, type FdrFormValues } from "../../features/fdr/types/FdrFormValues";
import { versPayloadApi } from "../../features/fdr/helpers/versPayloadApi";
import { useDocumentTitle } from "../../layout/useDocumentTitle";

const IDENTIFIANT_NOUVELLE_DEMANDE = "nouvelle";

export const useFdrNouvelleDemandePage = () => {
  const navigate = useNavigate();
  useDocumentTitle("Nouvelle demande — Formulaire de déclaration du risque");

  const methods = useForm<FdrFormValues>({
    resolver: zodResolver(fdrInformationsSchema),
    defaultValues: FDR_FORM_VALEURS_VIDES,
  });

  const creerDemandeMutation = useCreerDemandeAvecFdr();

  const { etatDe, modifierSection, validerSection, erreurValidationGlobale, fermerErreurValidationGlobale, verifierEtValider } =
    useFdrSectionsEtat({ identifiant: IDENTIFIANT_NOUVELLE_DEMANDE, lectureSeule: false, methods });

  const confirmerInformations = () =>
    verifierEtValider(() => {
      creerDemandeMutation.mutate(versPayloadApi(methods.getValues()), {
        onSuccess: (demande) => navigate(`/distributeur/demandes/${demande.id}/pieces`),
      });
    });

  return {
    methods,
    etatDe,
    modifierSection,
    validerSection,
    erreurValidationGlobale,
    fermerErreurValidationGlobale,
    erreurConfirmation: creerDemandeMutation.isError
      ? creerDemandeMutation.error instanceof ErreurFdrInvalide
        ? creerDemandeMutation.error.message
        : messageErreurAffichable(creerDemandeMutation.error)
      : null,
    fermerErreurConfirmation: () => creerDemandeMutation.reset(),
    confirmationEnCours: creerDemandeMutation.isPending,
    confirmerInformations,
    retournerAuxDemandes: () => navigate("/distributeur"),
  };
};
