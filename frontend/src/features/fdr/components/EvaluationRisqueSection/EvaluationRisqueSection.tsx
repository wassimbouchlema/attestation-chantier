import { Button, CardData, Loader, Title } from "@axa-fr/canopee-react/distributeur";
import analyticsIcon from "@material-symbols/svg-400/outlined/analytics.svg";

import { Surface } from "../../../../layout/Surface";
import { LIBELLE_NIVEAU_RISQUE, VARIANT_NIVEAU_RISQUE } from "../../constants/niveauRisqueLabel";
import { useEvaluationRisqueSection } from "./useEvaluationRisqueSection";

/** Indépendant de PiecesJustificativesSection : "dossier incomplet" et "risque élevé" sont deux signaux sans lien. */
export const EvaluationRisqueSection = ({ demandeId }: { demandeId: string }) => {
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
        <CardData
          title={`Score : ${resultat.score} / 100`}
          subTitle={`Niveau : ${LIBELLE_NIVEAU_RISQUE[resultat.niveau]}`}
          description={resultat.synthese}
          icon={analyticsIcon}
          variant={VARIANT_NIVEAU_RISQUE[resultat.niveau]}
        />
      )}
    </Surface>
  );
};
