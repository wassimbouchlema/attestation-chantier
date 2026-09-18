import { Button, Loader, MainContainer, Message, Tag } from "@axa-fr/canopee-react/distributeur";

import { EditeurProjetAttestation } from "../../features/projetAttestation/components/EditeurProjetAttestation/EditeurProjetAttestation";
import { PageHeader } from "../../layout/PageHeader";
import { Surface } from "../../layout/Surface";
import "./ProjetAttestationPage.css";
import { useProjetAttestationPage } from "./useProjetAttestationPage";

export const ProjetAttestationPage = () => {
  const {
    isLoading,
    introuvable,
    erreurChargement,
    reessayerChargement,
    projet,
    demande,
    agent,
    modifierContenu,
    dirty,
    previsualiser,
    telecharger,
    pdfEnCours,
    pdfDisabled,
    erreurPdf,
    fermerErreurPdf,
    enregistrer,
    enregistrementEnCours,
    erreurEnregistrement,
    fermerErreurEnregistrement,
    messageSucces,
    fermerMessageSucces,
    retournerADemande,
  } = useProjetAttestationPage();

  return (
    <>
      <PageHeader title="Projet d'attestation" actions={<Tag variant="warning">Non définitif</Tag>} />
      <MainContainer>
        <div className="container app-shell__content">
          <Message variant="info" title="Ce document est un projet. L'attestation définitive sera validée par le siège." />

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
                <p>Ce projet d'attestation est introuvable.</p>
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

          {projet && demande && agent && (
            <>
              <EditeurProjetAttestation
                demande={demande}
                agent={agent}
                valeurInitiale={projet.contenu_html}
                onChange={modifierContenu}
              />

              {erreurEnregistrement && (
                <Message
                  variant="error"
                  title={erreurEnregistrement}
                  onClose={fermerErreurEnregistrement}
                  closeButtonAriaLabel="Fermer"
                />
              )}

              {erreurPdf && (
                <Message variant="error" title={erreurPdf} onClose={fermerErreurPdf} closeButtonAriaLabel="Fermer" />
              )}

              {dirty && (
                <p className="projet-attestation-etat">
                  Modifications non enregistrées. Enregistrez vos modifications avant de générer le PDF.
                </p>
              )}

              <div className="fdr-actions-globales">
                <Button variant="secondary" onClick={retournerADemande}>
                  Retour à la demande
                </Button>
                <Button variant="primary" onClick={enregistrer} disabled={enregistrementEnCours}>
                  {enregistrementEnCours ? "Enregistrement…" : "Enregistrer"}
                </Button>
                <Button variant="secondary" onClick={previsualiser} disabled={pdfDisabled}>
                  Prévisualiser
                </Button>
                <Button variant="secondary" onClick={telecharger} disabled={pdfDisabled}>
                  {pdfEnCours ? "Génération…" : "Télécharger le projet"}
                </Button>
              </div>
            </>
          )}
        </div>
      </MainContainer>
    </>
  );
};
