import { Button, Loader, MainContainer, Message, Restitution, Tag, Title } from "@axa-fr/canopee-react/distributeur";

import { LIBELLE_DECISION } from "../../features/demandes/constants/optionsDecision";
import { LIBELLE_STATUT, VARIANT_STATUT } from "../../features/demandes/constants/statutLabel";
import { RecapitulatifFdr } from "../../features/fdr/components/RecapitulatifFdr/RecapitulatifFdr";
import { SyntheseDossierPieces } from "../../features/fdr/components/SyntheseDossierPieces/SyntheseDossierPieces";
import { SyntheseRisque } from "../../features/fdr/components/SyntheseRisque/SyntheseRisque";
import { formatDateHeure } from "../../helpers/formatDateHeure";
import { PageHeader } from "../../layout/PageHeader";
import { Surface } from "../../layout/Surface";
import { ComplementsDemandes } from "./ComplementsDemandes";
import "./DemandeConsultationPage.css";
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
    previsualiserAttestationFinale,
    telechargerAttestationFinale,
    attestationFinaleEnCours,
    erreurAttestationFinale,
    fermerErreurAttestationFinale,
    relancer,
    prochaineRelance,
    relanceEnCours,
    relanceDisabled,
    erreurRelance,
    fermerErreurRelance,
    projet,
    projetEnChargement,
    creerProjet,
    creationProjetEnCours,
    erreurCreationProjet,
    fermerErreurCreationProjet,
    modifierProjet,
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
                  {erreurRelance && (
                    <Message
                      variant="error"
                      title={erreurRelance}
                      onClose={fermerErreurRelance}
                      closeButtonAriaLabel="Fermer"
                    />
                  )}

                  <div className="consultation-document">
                    <div className="fdr-step-contenu fdr-step-contenu--restitution consultation-document__infos">
                      <Restitution label="Envoyée le">{formatDateHeure(demande.envoye_at)}</Restitution>
                      <Restitution label="Dernière relance">
                        {demande.last_relance_at ? formatDateHeure(demande.last_relance_at) : "Aucune"}
                      </Restitution>
                      {prochaineRelance && demande.statut === "EN_COURS" && (
                        <Restitution label="Nouvelle relance possible le">
                          {formatDateHeure(prochaineRelance.toISOString())}
                        </Restitution>
                      )}
                    </div>
                    {demande.statut === "EN_COURS" && (
                      <div className="consultation-document__actions">
                        <Button variant="secondary" onClick={relancer} disabled={relanceDisabled}>
                          {relanceEnCours ? "Relance en cours…" : "Relancer le siège"}
                        </Button>
                      </div>
                    )}
                  </div>
                </Surface>
              )}

              {demande.complement_actif && demande.statut !== "TRAITE" && (
                <ComplementsDemandes complement={demande.complement_actif} />
              )}

              {demande.statut === "TRAITE" && demande.decision && (
                <Surface>
                  <Title heading="h2">Décision du siège</Title>
                  <div className="fdr-step-contenu fdr-step-contenu--restitution">
                    <Restitution label="Décision">
                      <Tag variant="default">{LIBELLE_DECISION[demande.decision]}</Tag>
                    </Restitution>
                    {demande.decision === "REFUSEE" && (
                      <Restitution label="Motif du refus">
                        <span className="consultation-multiligne">{demande.motif_refus}</span>
                      </Restitution>
                    )}
                  </div>
                </Surface>
              )}

              {demande.decision === "ACCEPTEE" && demande.attestation_finale && (
                <Surface>
                  <Title heading="h2">Attestation définitive</Title>
                  {erreurAttestationFinale && (
                    <Message
                      variant="error"
                      title={erreurAttestationFinale}
                      onClose={fermerErreurAttestationFinale}
                      closeButtonAriaLabel="Fermer"
                    />
                  )}
                  <div className="consultation-document">
                    <div className="fdr-step-contenu fdr-step-contenu--restitution consultation-document__infos">
                      <Restitution label="Statut">Demande acceptée</Restitution>
                      {demande.attestation_finale.validated_at && (
                        <Restitution label="Date de validation">
                          {formatDateHeure(demande.attestation_finale.validated_at)}
                        </Restitution>
                      )}
                    </div>
                    <div className="consultation-document__actions">
                      <Button variant="secondary" onClick={previsualiserAttestationFinale} disabled={attestationFinaleEnCours}>
                        Prévisualiser
                      </Button>
                      <Button variant="primary" onClick={telechargerAttestationFinale} disabled={attestationFinaleEnCours}>
                        Télécharger
                      </Button>
                    </div>
                  </div>
                </Surface>
              )}

              {demande.complement_actif && demande.statut === "TRAITE" && (
                <ComplementsDemandes complement={demande.complement_actif} />
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
                {erreurPdf && (
                  <Message variant="error" title={erreurPdf} onClose={fermerErreurPdf} closeButtonAriaLabel="Fermer" />
                )}
                <div className="consultation-document">
                  <div className="fdr-step-contenu fdr-step-contenu--restitution consultation-document__infos">
                    <Restitution label="Document">Formulaire de déclaration du risque</Restitution>
                  </div>
                  <div className="consultation-document__actions">
                    <Button variant="secondary" onClick={previsualiser} disabled={pdfEnCours}>
                      Prévisualiser
                    </Button>
                    <Button variant="primary" onClick={telecharger} disabled={pdfEnCours}>
                      Télécharger
                    </Button>
                  </div>
                </div>
              </Surface>

              {demande.statut === "EN_COURS" && (
                <Surface>
                  <Title heading="h2">Projet d'attestation</Title>

                  {projetEnChargement && <Loader mode="get">{null}</Loader>}

                  {!projetEnChargement && !projet && demande.statut === "EN_COURS" && (
                    <>
                      {erreurCreationProjet && (
                        <Message
                          variant="error"
                          title={erreurCreationProjet}
                          onClose={fermerErreurCreationProjet}
                          closeButtonAriaLabel="Fermer"
                        />
                      )}
                      <div className="consultation-document">
                        <p className="consultation-document__infos">
                          Préparez un projet d'attestation à partir des informations du FDR.
                        </p>
                        <div className="consultation-document__actions">
                          <Button variant="secondary" onClick={creerProjet} disabled={creationProjetEnCours}>
                            {creationProjetEnCours ? "Création…" : "Créer le projet"}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}

                  {!projetEnChargement && projet && (
                    <div className="consultation-document">
                      <div className="fdr-step-contenu fdr-step-contenu--restitution consultation-document__infos">
                        <Restitution label="Dernière modification">{formatDateHeure(projet.updated_at)}</Restitution>
                      </div>
                      <div className="consultation-document__actions">
                        <Button variant="secondary" onClick={modifierProjet}>
                          Modifier le projet
                        </Button>
                      </div>
                    </div>
                  )}
                </Surface>
              )}

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
