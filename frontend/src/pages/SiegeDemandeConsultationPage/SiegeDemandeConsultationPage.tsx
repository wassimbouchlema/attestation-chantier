import { Button, Loader, MainContainer, Message, Restitution, Tag, Title } from "@axa-fr/canopee-react/distributeur";

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

              <div className="fdr-actions-globales">
                <Button variant="secondary" onClick={retournerAuxDemandes}>
                  Retour aux demandes
                </Button>
              </div>
            </>
          )}
        </div>
      </MainContainer>
    </>
  );
};
