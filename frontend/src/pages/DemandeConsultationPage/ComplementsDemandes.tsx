import { Restitution, Title } from "@axa-fr/canopee-react/distributeur";

import type { DemandeDetail } from "../../api/demandes";
import { formatDateHeure } from "../../helpers/formatDateHeure";
import { Surface } from "../../layout/Surface";

export const ComplementsDemandes = ({
  complement,
}: {
  complement: NonNullable<DemandeDetail["complement_actif"]>;
}) => (
  <Surface>
    <Title heading="h2">Compléments demandés par le siège</Title>
    <div className="fdr-step-contenu fdr-step-contenu--restitution">
      <Restitution label="Demandés le">{formatDateHeure(complement.requested_at)}</Restitution>
      <Restitution label="Demande du siège">
        <span className="consultation-multiligne">{complement.message}</span>
      </Restitution>
    </div>
  </Surface>
);
