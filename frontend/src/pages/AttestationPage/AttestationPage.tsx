import { Button, Loader, MainContainer, Message, Modal, ModalBody, ModalFooter, ModalHeader, Tag } from "@axa-fr/canopee-react/distributeur";

import { EditeurProjetAttestation } from "../../features/projetAttestation/components/EditeurProjetAttestation/EditeurProjetAttestation";
import { ResultatCoherence } from "../../features/attestation/components/ResultatCoherence";
import { PageHeader } from "../../layout/PageHeader";
import { Surface } from "../../layout/Surface";
import "./AttestationPage.css";
import { useAttestationPage } from "./useAttestationPage";

export const AttestationPage = () => {
  const { dialogRef, ...page } = useAttestationPage();
  return (
    <>
      <PageHeader title="Préparation d'attestation" actions={<Tag variant="warning">Non validée</Tag>} />
      <MainContainer>
        <div className="container app-shell__content">
          <Message variant="info" title="Cette attestation est en préparation et n'est pas encore validée." />
          {page.isLoading && <Loader mode="get">{null}</Loader>}
          {page.introuvable && <Message variant="error" title="Cette attestation est introuvable." />}
          {page.erreurChargement && (
            <>
              <Message variant="error" title={page.erreurChargement} />
              <Button variant="secondary" onClick={page.reessayer}>Réessayer</Button>
            </>
          )}
          {!page.erreurChargement && page.attestation && page.demande && (
            <>
              <EditeurProjetAttestation
                key={page.attestation.id}
                preparation
                demande={page.demande}
                valeurInitiale={page.attestation.contenu_html}
                onChange={page.modifierContenu}
                disabled={page.enregistrementEnCours || page.validationEnCours}
              />
              {page.succes && <Message variant="success" title="Attestation enregistrée." />}
              {page.erreurEnregistrement && <Message variant="error" title={page.erreurEnregistrement} />}
              {page.erreurPdf && <Message variant="error" title={page.erreurPdf} />}
              {page.erreurValidation && <Message variant="error" title={page.erreurValidation} />}
              {page.dirty && <p>Enregistrez vos modifications avant de générer la prévisualisation.</p>}
              {page.dirty && <p>Enregistrez vos modifications avant de valider l'attestation.</p>}
              <div className="fdr-actions-globales">
                <Button variant="secondary" onClick={page.retourner}>Retour à la demande</Button>
                <div className="fdr-actions-globales__groupe">
                  <Button variant="secondary" onClick={page.enregistrer} disabled={page.enregistrementEnCours || page.validationEnCours}>
                    {page.enregistrementEnCours ? "Enregistrement…" : "Enregistrer"}
                  </Button>
                  <Button variant="secondary" onClick={page.previsualiser} disabled={page.pdfDisabled}>
                    Prévisualiser
                  </Button>
                  <Button variant="secondary" onClick={page.telecharger} disabled={page.pdfDisabled}>
                    Télécharger la prévisualisation
                  </Button>
                  <Button variant="primary" onClick={page.ouvrirConfirmation} disabled={page.validationDisabled}>
                    Valider et accepter
                  </Button>
                </div>
              </div>
              <div className="attestation-coherence">
                <Surface>
                  <section aria-labelledby="titre-coherence" aria-busy={page.analyseEnCours}>
                    <h2 id="titre-coherence">Contrôle de cohérence</h2>
                    {page.dirty && <p>Enregistrez vos modifications avant de lancer le contrôle.</p>}
                    <Button variant="secondary" onClick={page.analyser} disabled={page.analyseDisabled}>
                      {page.analyseEnCours ? "Analyse en cours…" : "Analyser avec IA"}
                    </Button>
                    <div aria-live="polite">
                      {page.erreurAnalyse && <Message variant="error" title={page.erreurAnalyse} />}
                      {page.resultatAnalyse && <ResultatCoherence resultat={page.resultatAnalyse} />}
                    </div>
                  </section>
                </Surface>
              </div>
            </>
          )}
          {(page.erreurChargement || !page.attestation || !page.demande) && (
            <Button variant="secondary" onClick={page.retourner}>Retour à la demande</Button>
          )}
        </div>
      </MainContainer>
      {page.confirmationOuverte && (
        <Modal
          ref={dialogRef}
          title="Valider et accepter cette demande ?"
          onOutsideTap={page.fermerConfirmation}
          onCancel={(event) => {
            event.preventDefault();
            page.fermerConfirmation();
          }}
        >
          <ModalHeader onCancel={page.fermerConfirmation} closeButtonAriaLabel="Fermer">
            Valider et accepter cette demande ?
          </ModalHeader>
          <ModalBody>
            <p>
              Cette action générera l'attestation définitive et marquera la demande comme traitée et acceptée.
            </p>
            <p>L'attestation ne pourra plus être modifiée après validation.</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={page.fermerConfirmation} disabled={page.validationEnCours}>
              Annuler
            </Button>
            <Button variant="primary" onClick={page.confirmerValidation} disabled={page.validationEnCours}>
              {page.validationEnCours ? "Validation…" : "Valider et accepter"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
};
