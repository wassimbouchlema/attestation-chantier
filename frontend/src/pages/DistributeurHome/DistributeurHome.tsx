import { Button, EditorialMessage, Loader, MainContainer, Message } from "@axa-fr/canopee-react/distributeur";
import assignmentIcon from "@material-symbols/svg-400/outlined/assignment.svg";

import { DemandesFiltres } from "../../features/demandes/components/DemandesFilter/DemandesFiltres";
import { DemandesTable } from "../../features/demandes/components/DemandesTable/DemandesTable";
import { SupprimerBrouillonModal } from "../../features/demandes/components/SupprimerBrouillonModal/SupprimerBrouillonModal";
import { PageHeader } from "../../layout/PageHeader";
import { Surface } from "../../layout/Surface";
import "./DistributeurHome.css";
import { useDistributeurHome } from "./useDistributeurHome";

export const DistributeurHome = () => {
  const {
    filtres,
    aucunFiltre,
    page,
    nombreDePages,
    demandes,
    isLoading,
    messageSucces,
    fermerMessageSucces,
    erreurChargement,
    reessayerChargement,
    changerStatut,
    changerDecision,
    changerComplements,
    changerPage,
    telechargerAttestation,
    attestationEnCours,
    erreurAttestation,
    fermerErreurAttestation,
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
        sansAccueil
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

          {erreurAttestation && (
            <Message
              title={erreurAttestation}
              variant="error"
              onClose={fermerErreurAttestation}
              closeButtonAriaLabel="Fermer"
            />
          )}

          <div className="distributeur-home__liste">
            <DemandesFiltres
              filtres={filtres}
              onStatutChange={changerStatut}
              onDecisionChange={changerDecision}
              onComplementsChange={changerComplements}
            />

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

            {!isLoading && !erreurChargement && demandes.length === 0 && aucunFiltre && (
              <Surface>
                <EditorialMessage type="information" icon={assignmentIcon} title="Aucune demande pour le moment.">
                  Les demandes que vous créez apparaîtront ici.
                </EditorialMessage>
              </Surface>
            )}

            {!isLoading && !erreurChargement && demandes.length === 0 && !aucunFiltre && (
              <Surface>
                <EditorialMessage type="information" icon={assignmentIcon} title="Aucune demande ne correspond à ce filtre.">
                  Essayez d'autres filtres.
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
                onTelechargerAttestation={telechargerAttestation}
                attestationEnCours={attestationEnCours}
              />
            )}
          </div>
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
