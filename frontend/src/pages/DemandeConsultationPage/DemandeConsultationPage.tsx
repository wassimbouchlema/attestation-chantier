import { Button, Loader, MainContainer, Message, Restitution, Tag, Title } from "@axa-fr/canopee-react/distributeur";

import { LIBELLE_STATUT, VARIANT_STATUT } from "../../features/demandes/constants/statutLabel";
import { RecapitulatifFdr } from "../../features/fdr/components/RecapitulatifFdr/RecapitulatifFdr";
import { SyntheseDossierPieces } from "../../features/fdr/components/SyntheseDossierPieces/SyntheseDossierPieces";
import { SyntheseRisque } from "../../features/fdr/components/SyntheseRisque/SyntheseRisque";
import { formatDateHeure } from "../../helpers/formatDateHeure";
import { PageHeader } from "../../layout/PageHeader";
import { Surface } from "../../layout/Surface";
import { useDemandeConsultationPage } from "./useDemandeConsultationPage";

export const DemandeConsultationPage = () => {
  const {
    isLoading,
    introuvable,
    erreurChargement,
    reessayerChargement,
    demande,
    messageSucces,
    fermerMessageSucces,
    previsualiser,
    telecharger,
    pdfEnCours,
    erreurPdf,
    fermerErreurPdf,
    relancer,
    prochaineRelance,
    relanceEnCours,
    relanceDisabled,
    erreurRelance,
    fermerErreurRelance,
    retournerAuxDemandes,
  } = useDemandeConsultationPage();

  return (
    <>
      <PageHeader
        title="Demande d'attestation"
        actions={demande && <Tag variant={VARIANT_STATUT[demande.statut]}>{LIBELLE_STATUT[demande.statut]}</Tag>}
      />
      <MainContainer>
        <div className="container app-shell__content">
          {messageSucces && (
            <Message
              variant="success"
              title={messageSucces}
              onClose={fermerMessageSucces}
              closeButtonAriaLabel="Fermer"
            />
          )}

          {isLoading && <Loader mode="get">{null}</Loader>}

          {!isLoading && introuvable && (
            <Surface>
              <div role="alert">
                <p>Cette demande est introuvable.</p>
              </div>
            </Surface>
          )}

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

          {demande && (
            <>
              {demande.envoye_at && (
                <Surface>
                  <Title heading="h2">Suivi de la demande</Title>
                  <div className="fdr-step-contenu fdr-step-contenu--restitution">
                    <Restitution label="Envoyée le">{formatDateHeure(demande.envoye_at)}</Restitution>
                    <Restitution label="Dernière relance">
                      {demande.last_relance_at ? formatDateHeure(demande.last_relance_at) : "Aucune"}
                    </Restitution>
                    {prochaineRelance && (
                      <Restitution label="Nouvelle relance possible le">
                        {formatDateHeure(prochaineRelance.toISOString())}
                      </Restitution>
                    )}
                  </div>

                  {erreurRelance && (
                    <Message
                      variant="error"
                      title={erreurRelance}
                      onClose={fermerErreurRelance}
                      closeButtonAriaLabel="Fermer"
                    />
                  )}

                  {demande.statut === "EN_COURS" && (
                    <Button variant="secondary" onClick={relancer} disabled={relanceDisabled}>
                      {relanceEnCours ? "Relance en cours…" : "Relancer le siège"}
                    </Button>
                  )}
                </Surface>
              )}

              <RecapitulatifFdr fdr={demande.fdr} />
              <SyntheseDossierPieces demandeId={demande.id} afficherTableau />
              <SyntheseRisque demandeId={demande.id} />

              {demande.commentaire_distributeur && (
                <Surface>
                  <Title heading="h2">Commentaire distributeur</Title>
                  <p>{demande.commentaire_distributeur}</p>
                </Surface>
              )}

              <Surface>
                <Title heading="h2">Document transmis</Title>
                <p>Formulaire de déclaration du risque</p>
                {erreurPdf && (
                  <Message variant="error" title={erreurPdf} onClose={fermerErreurPdf} closeButtonAriaLabel="Fermer" />
                )}
                <Button variant="secondary" onClick={previsualiser} disabled={pdfEnCours}>
                  Prévisualiser
                </Button>
                <Button variant="primary" onClick={telecharger} disabled={pdfEnCours}>
                  Télécharger
                </Button>
              </Surface>

              <div className="fdr-actions-globales">
                <Button variant="secondary" onClick={retournerAuxDemandes}>
                  Retour à mes demandes
                </Button>
              </div>
            </>
          )}
        </div>
      </MainContainer>
    </>
  );
};
