import { Loader, MainContainer } from "@axa-fr/canopee-react/distributeur";
import { FormProvider } from "react-hook-form";
import { Link, Outlet } from "react-router-dom";

import { PageHeader } from "../../../../layout/PageHeader";
import { Surface } from "../../../../layout/Surface";
import { FdrStepper } from "../FdrStepper/FdrStepper";
import { useFdrWizardLayout } from "./useFdrWizardLayout";

/**
 * Shell du parcours FDR : reste monté pour toutes les routes enfants
 * (informations/pieces/validation) via <Outlet>. Orchestration (chargement
 * de la demande, hydratation du FormProvider) dans useFdrWizardLayout.
 */
export const FdrWizardLayout = () => {
  const { demande, isLoading, isError, introuvable, erreurAffichable, methods } = useFdrWizardLayout();

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
        <div className="container-fluid app-shell__content">
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
                <p>{erreurAffichable}</p>
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
