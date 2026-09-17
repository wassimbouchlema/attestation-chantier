import { Button, EditorialMessage, Loader, MainContainer, Message } from "@axa-fr/canopee-react/distributeur";
import assignmentIcon from "@material-symbols/svg-400/outlined/assignment.svg";

import { DemandesFilter } from "../../features/demandes/components/DemandesFilter/DemandesFilter";
import { DemandesTable } from "../../features/demandes/components/DemandesTable/DemandesTable";
import { PageHeader } from "../../layout/PageHeader";
import { Surface } from "../../layout/Surface";
import { useDistributeurHome } from "./useDistributeurHome";

export const DistributeurHome = () => {
  const {
    statutSelectionne,
    page,
    nombreDePages,
    demandes,
    isLoading,
    erreurChargement,
    reessayerChargement,
    changerStatut,
    changerPage,
    creerDemande,
    creationEnCours,
    erreurCreation,
    fermerErreurCreation,
  } = useDistributeurHome();

  return (
    <>
      <PageHeader
        title="Mes demandes"
        subtitle="Suivez et gérez vos demandes d'attestation de chantier."
        actions={
          <Button variant="primary" onClick={creerDemande} disabled={creationEnCours}>
            {creationEnCours ? "Création…" : "Nouvelle demande"}
          </Button>
        }
      />
      <MainContainer>
        <div className="container-fluid app-shell__content">
          {creationEnCours && (
            <p role="status" className="sr-only">
              Création de la demande en cours…
            </p>
          )}
          {erreurCreation && (
            <Message
              title={erreurCreation}
              variant="error"
              onClose={fermerErreurCreation}
              closeButtonAriaLabel="Fermer"
            />
          )}

          <Surface>
            <DemandesFilter statut={statutSelectionne} onChange={changerStatut} />
          </Surface>

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

          {!isLoading && !erreurChargement && demandes.length === 0 && statutSelectionne === "" && (
            <Surface>
              <EditorialMessage type="information" icon={assignmentIcon} title="Aucune demande pour le moment.">
                Les demandes que vous créez apparaîtront ici.
              </EditorialMessage>
            </Surface>
          )}

          {!isLoading && !erreurChargement && demandes.length === 0 && statutSelectionne !== "" && (
            <Surface>
              <EditorialMessage type="information" icon={assignmentIcon} title="Aucune demande ne correspond à ce filtre.">
                Essayez un autre statut.
              </EditorialMessage>
            </Surface>
          )}

          {!isLoading && !erreurChargement && demandes.length > 0 && (
            <DemandesTable demandes={demandes} page={page} nombreDePages={nombreDePages} onPageChange={changerPage} />
          )}
        </div>
      </MainContainer>
    </>
  );
};
