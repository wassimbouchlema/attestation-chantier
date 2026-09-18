import { Button, EditorialMessage, Loader, MainContainer, Message } from "@axa-fr/canopee-react/distributeur";
import assignmentIcon from "@material-symbols/svg-400/outlined/assignment.svg";

import { DemandesFilter } from "../../features/demandes/components/DemandesFilter/DemandesFilter";
import { DemandesTable } from "../../features/demandes/components/DemandesTable/DemandesTable";
import { SupprimerBrouillonModal } from "../../features/demandes/components/SupprimerBrouillonModal/SupprimerBrouillonModal";
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
    messageSucces,
    fermerMessageSucces,
    erreurChargement,
    reessayerChargement,
    changerStatut,
    changerPage,
    creerDemande,
    demandeASupprimer,
    ouvrirSuppression,
    annulerSuppression,
    confirmerSuppression,
    suppressionEnCours,
    erreurSuppression,
    fermerErreurSuppression,
  } = useDistributeurHome();

  return (
    <>
      <PageHeader
        title="Mes demandes"
        subtitle="Suivez et gérez vos demandes d'attestation de chantier."
        actions={
          <Button variant="primary" onClick={creerDemande}>
            Nouvelle demande
          </Button>
        }
      />
      <MainContainer>
        <div className="container-fluid app-shell__content">
          {messageSucces && (
            <Message
              variant="success"
              title={messageSucces}
              onClose={fermerMessageSucces}
              closeButtonAriaLabel="Fermer"
            />
          )}
          {erreurSuppression && (
            <Message
              title={erreurSuppression}
              variant="error"
              onClose={fermerErreurSuppression}
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
            <DemandesTable
              demandes={demandes}
              page={page}
              nombreDePages={nombreDePages}
              onPageChange={changerPage}
              onSupprimer={ouvrirSuppression}
            />
          )}
        </div>
      </MainContainer>

      <SupprimerBrouillonModal
        ouvert={demandeASupprimer !== null}
        onConfirmer={confirmerSuppression}
        onAnnuler={annulerSuppression}
        suppressionEnCours={suppressionEnCours}
      />
    </>
  );
};
