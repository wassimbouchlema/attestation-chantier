import { useLayoutEffect, useRef } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader, MainContainer } from "@axa-fr/canopee-react/distributeur";
import { FormProvider, useForm } from "react-hook-form";
import { Link, Outlet, useParams } from "react-router-dom";

import { ErreurDemandeIntrouvable } from "../../../../api/demandes";
import { messageErreurAffichable } from "../../../demandes/helpers/messageErreur";
import { useDemande } from "../../../demandes/queries";
import { PageHeader } from "../../../../layout/PageHeader";
import { Surface } from "../../../../layout/Surface";
import { versFormValues } from "../../helpers/versFormValues";
import { fdrInformationsSchema } from "../../schemas/fdrInformationsSchema";
import { FDR_FORM_VALEURS_VIDES, type FdrFormValues } from "../../types/FdrFormValues";
import { FdrStepper } from "../FdrStepper/FdrStepper";

/**
 * Shell du parcours FDR : charge la Demande (avec son FDR imbriqué, déjà
 * disponible via useDemande/DemandeDetailSerializer — aucun second appel
 * réseau), initialise un unique FormProvider, reste monté pour toutes les
 * routes enfants (informations/pieces/validation) via <Outlet>.
 *
 * Hydratation volontairement ponctuelle (pas `values:` réactif) : reset()
 * une seule fois par id de demande, gardé par une ref. Un refetch TanStack
 * ultérieur (ex. retour d'onglet — refetchOnWindowFocus n'est pas désactivé
 * dans queryClient.ts) ne doit jamais écraser silencieusement les
 * modifications locales de l'utilisateur.
 */
export const FdrWizardLayout = () => {
  const { id } = useParams<{ id: string }>();
  const { data: demande, isLoading, isError, error } = useDemande(id);

  const methods = useForm<FdrFormValues>({
    resolver: zodResolver(fdrInformationsSchema),
    defaultValues: FDR_FORM_VALEURS_VIDES,
  });

  const idHydrateRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (demande && idHydrateRef.current !== demande.id) {
      methods.reset(versFormValues(demande.fdr));
      idHydrateRef.current = demande.id;
    }
  }, [demande, methods]);

  const introuvable = error instanceof ErreurDemandeIntrouvable;

  return (
    <>
      <PageHeader
        title="Formulaire de déclaration du risque"
        actions={<Link to="/distributeur">Retour à mes demandes</Link>}
      />
      {/*
        Bande pleine largeur, directement accolée au bandeau bleu — .af-container
        (classe Canopée) n'apporte qu'un padding horizontal responsive, le même
        que celui utilisé en interne par HeaderTitle : alignement garanti avec le
        bandeau, sans le max-width:1440px de .container (réservé au contenu
        métier ci-dessous, dans MainContainer).
      */}
      <div className="af-container">
        <FdrStepper />
      </div>
      <MainContainer>
        <div className="container app-shell__content">
          {isLoading && <Loader mode="get">{null}</Loader>}

          {!isLoading && introuvable && (
            <Surface>
              <div role="alert">
                <p>Cette demande est introuvable.</p>
              </div>
            </Surface>
          )}

          {!isLoading && isError && !introuvable && (
            <Surface>
              <div role="alert">
                <p>{messageErreurAffichable(error)}</p>
              </div>
            </Surface>
          )}

          {!isLoading && demande && (
            <FormProvider {...methods}>
              <Outlet context={{ demande }} />
            </FormProvider>
          )}
        </div>
      </MainContainer>
    </>
  );
};
