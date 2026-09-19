import { Button, Loader, MainContainer, Message, Tag } from "@axa-fr/canopee-react/distributeur";

import { EditeurProjetAttestation } from "../../features/projetAttestation/components/EditeurProjetAttestation/EditeurProjetAttestation";
import { PageHeader } from "../../layout/PageHeader";
import { useAttestationPage } from "./useAttestationPage";

export const AttestationPage = () => {
  const page = useAttestationPage();
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
                disabled={page.enregistrementEnCours}
              />
              {page.succes && <Message variant="success" title="Attestation enregistrée." />}
              {page.erreurEnregistrement && <Message variant="error" title={page.erreurEnregistrement} />}
              {page.erreurPdf && <Message variant="error" title={page.erreurPdf} />}
              {page.dirty && <p>Enregistrez vos modifications avant de générer la prévisualisation.</p>}
              <div className="fdr-actions-globales">
                <Button variant="primary" onClick={page.enregistrer} disabled={page.enregistrementEnCours}>
                  {page.enregistrementEnCours ? "Enregistrement…" : "Enregistrer"}
                </Button>
                <Button variant="secondary" onClick={page.previsualiser} disabled={page.pdfDisabled}>
                  Prévisualiser
                </Button>
                <Button variant="secondary" onClick={page.telecharger} disabled={page.pdfDisabled}>
                  Télécharger la prévisualisation
                </Button>
              </div>
            </>
          )}
          <Button variant="secondary" onClick={page.retourner}>Retour à la demande</Button>
        </div>
      </MainContainer>
    </>
  );
};
