import { Button, EditorialMessage, Loader, MainContainer } from "@axa-fr/canopee-react/distributeur";
import assignmentIcon from "@material-symbols/svg-400/outlined/assignment.svg";

import { SiegeDemandesTable } from "../../features/siege/components/SiegeDemandesTable/SiegeDemandesTable";
import { useDocumentTitle } from "../../layout/useDocumentTitle";
import { PageHeader } from "../../layout/PageHeader";
import { Surface } from "../../layout/Surface";
import { useSiegeHome } from "./useSiegeHome";

export const SiegeHome = () => {
  useDocumentTitle("Demandes à traiter");
  const { page, nombreDePages, demandes, isLoading, erreurChargement, reessayerChargement, changerPage } =
    useSiegeHome();

  return (
    <>
      <PageHeader
        title="Demandes à traiter"
        subtitle="Consultez et traitez les demandes d'attestation transmises par les distributeurs."
      />
      <MainContainer>
        <div className="container-fluid app-shell__content">
          {isLoading && <Loader mode="get">{null}</Loader>}

          {!isLoading && erreurChargement && (
            <Surface>
              <div role="alert">
                <p>{erreurChargement}</p>
                <Button variant="secondary" onClick={reessayerChargement}>
                  Réessayer
                </Button>
              </div>
            </Surface>
          )}

          {!isLoading && !erreurChargement && demandes.length === 0 && (
            <Surface>
              <EditorialMessage type="information" icon={assignmentIcon} title="Aucune demande pour le moment.">
                Les demandes transmises par les distributeurs apparaîtront ici.
              </EditorialMessage>
            </Surface>
          )}

          {!isLoading && !erreurChargement && demandes.length > 0 && (
            <SiegeDemandesTable demandes={demandes} page={page} nombreDePages={nombreDePages} onPageChange={changerPage} />
          )}
        </div>
      </MainContainer>
    </>
  );
};
