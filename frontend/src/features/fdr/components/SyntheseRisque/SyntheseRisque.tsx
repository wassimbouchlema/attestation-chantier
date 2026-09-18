import { Button, Loader, Restitution, Title } from "@axa-fr/canopee-react/distributeur";

import { Surface } from "../../../../layout/Surface";
import { LIBELLE_NIVEAU_RISQUE } from "../../constants/niveauRisqueLabel";
import { useEvaluationRisqueSection } from "../EvaluationRisqueSection/useEvaluationRisqueSection";

export const SyntheseRisque = ({ demandeId }: { demandeId: string }) => {
  const { isLoading, erreurChargement, reessayerChargement, resultat } = useEvaluationRisqueSection(demandeId);

  return (
    <Surface>
      <Title heading="h2">Évaluation automatique du risque</Title>

      {isLoading && <Loader mode="get">{null}</Loader>}

      {erreurChargement && (
        <div role="alert">
          <p>{erreurChargement}</p>
          <Button variant="secondary" onClick={reessayerChargement}>
            Réessayer
          </Button>
        </div>
      )}

      {resultat && (
        <div className="fdr-step-contenu fdr-step-contenu--restitution">
          <Restitution label="Niveau">{LIBELLE_NIVEAU_RISQUE[resultat.niveau]}</Restitution>
          <Restitution label="Score">{resultat.score} / 100</Restitution>
          <Restitution label="Synthèse">{resultat.synthese}</Restitution>
        </div>
      )}
    </Surface>
  );
};
