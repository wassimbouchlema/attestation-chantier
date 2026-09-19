import {
  Button, Loader, MainContainer, Message, Modal, ModalBody, ModalFooter,
  ModalHeader, Restitution, Tag, TextareaInput, Title,
} from "@axa-fr/canopee-react/distributeur";

import { LIBELLE_STATUT, VARIANT_STATUT } from "../../features/demandes/constants/statutLabel";
import { RecapitulatifFdr } from "../../features/fdr/components/RecapitulatifFdr/RecapitulatifFdr";
import { SyntheseDossierPieces } from "../../features/fdr/components/SyntheseDossierPieces/SyntheseDossierPieces";
import { SyntheseRisque } from "../../features/fdr/components/SyntheseRisque/SyntheseRisque";
import { PieceActions } from "../../features/siege/components/PieceActions/PieceActions";
import { BASE_PATH_SIEGE } from "../../features/siege/queries";
import { formatDateHeure } from "../../helpers/formatDateHeure";
import { PageHeader } from "../../layout/PageHeader";
import { Surface } from "../../layout/Surface";
import { useSiegeDemandeConsultationPage } from "./useSiegeDemandeConsultationPage";
import "./SiegeDemandeConsultationPage.css";

export const SiegeDemandeConsultationPage = () => {
  const {
    isLoading,
    introuvable,
    erreurChargement,
    reessayerChargement,
    demande,
    previsualiser,
    telecharger,
    pdfEnCours,
    erreurPdf,
    fermerErreurPdf,
    retournerAuxDemandes,
    traitable,
    ouvrirAttestation,
    preparationEnCours,
    erreurPreparation,
    peutDemanderComplements,
    actionTraitement,
    ouvrirTraitement,
    fermerTraitement,
    confirmerTraitement,
    texteTraitement,
    changerTexteTraitement,
    erreurSaisie,
    erreurTraitement,
    traitementEnCours,
    dialogRef,
    messageSucces,
    fermerMessageSucces,
  } = useSiegeDemandeConsultationPage();

  return (
    <>
      <PageHeader
        title="Demande d'attestation"
        actions={demande && <Tag variant={VARIANT_STATUT[demande.statut]}>{LIBELLE_STATUT[demande.statut]}</Tag>}
      />
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
              <Surface>
                <Title heading="h2">Suivi de la demande</Title>
                <div className="fdr-step-contenu fdr-step-contenu--restitution">
                  <Restitution label="Envoyée le">
                    {demande.envoye_at ? formatDateHeure(demande.envoye_at) : "—"}
                  </Restitution>
                  <Restitution label="Distributeur">{demande.distributeur_nom ?? "—"}</Restitution>
                </div>
              </Surface>

              <RecapitulatifFdr fdr={demande.fdr} />
              <SyntheseDossierPieces
                demandeId={demande.id}
                afficherTableau
                basePath={BASE_PATH_SIEGE}
                actionsPiece={(piece) => <PieceActions demandeId={demande.id} piece={piece} />}
              />
              <SyntheseRisque demandeId={demande.id} basePath={BASE_PATH_SIEGE} />

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

              <Surface>
                <Title heading="h2">Traitement de la demande</Title>
                {messageSucces && (
                  <Message
                    variant="success"
                    title={messageSucces}
                    onClose={fermerMessageSucces}
                    closeButtonAriaLabel="Fermer"
                  />
                )}
                {demande.complement_actif && (
                  <div>
                    <Title heading="h3">Compléments demandés</Title>
                    <p className="siege-complement-message">{demande.complement_actif.message}</p>
                    <p>Demandés le {formatDateHeure(demande.complement_actif.requested_at)}</p>
                  </div>
                )}
                {traitable && (
                  <div className="fdr-actions-globales">
                    <Button variant="primary" onClick={ouvrirAttestation} disabled={preparationEnCours}>
                      {demande.attestation_existe ? "Reprendre l'attestation" : "Préparer l'attestation"}
                    </Button>
                    {peutDemanderComplements && (
                      <Button variant="secondary" onClick={() => ouvrirTraitement("demander-complements")}>
                        Demander des compléments
                      </Button>
                    )}
                    <Button variant="danger" onClick={() => ouvrirTraitement("refuser")}>
                      Refuser
                    </Button>
                  </div>
                )}
                {erreurPreparation && <Message variant="error" title={erreurPreparation} />}
              </Surface>

              <div className="fdr-actions-globales">
                <Button variant="secondary" onClick={retournerAuxDemandes}>
                  Retour aux demandes
                </Button>
              </div>
            </>
          )}
        </div>
      </MainContainer>
      {actionTraitement && (
        <Modal
          ref={dialogRef}
          title={actionTraitement === "refuser" ? "Refuser la demande" : "Demander des compléments"}
          onOutsideTap={fermerTraitement}
          onCancel={(event) => {
            event.preventDefault();
            fermerTraitement();
          }}
        >
          <ModalHeader onCancel={fermerTraitement} closeButtonAriaLabel="Fermer">
            {actionTraitement === "refuser" ? "Refuser la demande" : "Demander des compléments"}
          </ModalHeader>
          <ModalBody>
            {actionTraitement === "refuser" && <p>Confirmez le refus de cette demande. Elle sera marquée comme traitée.</p>}
            <TextareaInput
              id="texte-traitement"
              className="siege-traitement-textarea"
              classNameContainerLabel="col-12"
              classNameContainerInput="col-12"
              label={actionTraitement === "refuser"
                ? "Motif du refus"
                : "Précisez les informations ou documents complémentaires attendus."}
              required
              rows={6}
              style={{ resize: "vertical" }}
              value={texteTraitement}
              onChange={(event) => changerTexteTraitement(event.target.value)}
              disabled={traitementEnCours}
            />
            {erreurSaisie && <Message variant="error" title={erreurSaisie} />}
            {erreurTraitement && <Message variant="error" title={erreurTraitement} />}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={fermerTraitement} disabled={traitementEnCours}>
              Annuler
            </Button>
            <Button
              variant={actionTraitement === "refuser" ? "danger" : "primary"}
              onClick={confirmerTraitement}
              disabled={traitementEnCours}
            >
              {actionTraitement === "refuser" ? "Confirmer le refus" : "Envoyer la demande de compléments"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
};
