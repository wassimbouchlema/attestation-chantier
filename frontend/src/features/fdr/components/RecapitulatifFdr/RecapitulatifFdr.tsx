import { Restitution, Title } from "@axa-fr/canopee-react/distributeur";

import { Surface } from "../../../../layout/Surface";
import { construireRecapitulatifFdr } from "../../helpers/construireRecapitulatifFdr";
import type { FormulaireRisqueApi } from "../../../../api/demandes";

export const RecapitulatifFdr = ({ fdr }: { fdr: FormulaireRisqueApi }) => {
  const sections = construireRecapitulatifFdr(fdr);

  return (
    <Surface>
      <Title heading="h2">Récapitulatif des informations</Title>
      {sections.map((section) => (
        <section key={section.titre}>
          <Title heading="h3">{section.titre}</Title>
          <div className="fdr-step-contenu fdr-step-contenu--restitution">
            {section.lignes.map((ligne) => (
              <Restitution key={ligne.label} label={ligne.label}>
                {ligne.valeur}
              </Restitution>
            ))}
          </div>
        </section>
      ))}
    </Surface>
  );
};
