import { Button, Message, TextareaInput, Title } from "@axa-fr/canopee-react/distributeur";
import { useEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";

import { RecapitulatifFdr } from "../../features/fdr/components/RecapitulatifFdr/RecapitulatifFdr";
import { SyntheseDossierPieces } from "../../features/fdr/components/SyntheseDossierPieces/SyntheseDossierPieces";
import { SyntheseRisque } from "../../features/fdr/components/SyntheseRisque/SyntheseRisque";
import type { FdrOutletContext } from "../../features/fdr/types/FdrOutletContext";
import { Surface } from "../../layout/Surface";
import { useFdrValidationPage } from "./useFdrValidationPage";

export const FdrValidationPage = () => {
  const { demande } = useOutletContext<FdrOutletContext>();
  const {
    lectureSeule,
    fdr,
    commentaire,
    modifierCommentaire,
    enregistrerBrouillon,
    enregistrementEnCours,
    erreurSauvegarde,
    fermerErreurSauvegarde,
    envoyer,
    envoiEnCours,
    erreurEnvoi,
    fermerErreurEnvoi,
    retourner,
  } = useFdrValidationPage(demande);

  const messageErreurEnvoiRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (erreurEnvoi) {
      messageErreurEnvoiRef.current?.focus();
      messageErreurEnvoiRef.current?.scrollIntoView?.({ block: "center" });
    }
  }, [erreurEnvoi]);

  return (
    <>
      {erreurEnvoi && (
        <div ref={messageErreurEnvoiRef} tabIndex={-1}>
          <Message variant="error" title={erreurEnvoi.titre} onClose={fermerErreurEnvoi} closeButtonAriaLabel="Fermer">
            {erreurEnvoi.details.length > 0 && (
              <ul>
                {erreurEnvoi.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            )}
          </Message>
        </div>
      )}

      <RecapitulatifFdr fdr={fdr} />
      <SyntheseDossierPieces demandeId={demande.id} onRetourPieces={lectureSeule ? undefined : retourner} />
      <SyntheseRisque demandeId={demande.id} />

      <Surface>
        <Title heading="h2">Commentaire au siège</Title>
        <TextareaInput
          label="Commentaire (optionnel)"
          labelPosition="top"
          value={commentaire}
          onChange={(event) => modifierCommentaire(event.target.value)}
          disabled={lectureSeule || envoiEnCours}
        />
        {erreurSauvegarde && (
          <Message
            variant="error"
            title={erreurSauvegarde}
            onClose={fermerErreurSauvegarde}
            closeButtonAriaLabel="Fermer"
          />
        )}
      </Surface>

      {!lectureSeule && (
        <div className="fdr-actions-globales">
          <Button variant="secondary" onClick={retourner}>
            Retour
          </Button>
          <Button variant="secondary" onClick={enregistrerBrouillon} disabled={enregistrementEnCours || envoiEnCours}>
            {enregistrementEnCours ? "Enregistrement…" : "Enregistrer le brouillon"}
          </Button>
          <Button variant="primary" onClick={envoyer} disabled={envoiEnCours || enregistrementEnCours}>
            {envoiEnCours ? "Envoi…" : "Envoyer au siège"}
          </Button>
        </div>
      )}
    </>
  );
};
