import { SelectInput } from "@axa-fr/canopee-react/distributeur";

import type { StatutDemande } from "../../../../api/demandes";
import { OPTIONS_STATUT } from "../../constants/optionsStatut";

export const DemandesFilter = ({
  statut,
  onChange,
}: {
  statut: StatutDemande | "";
  onChange: (statut: StatutDemande | "") => void;
}) => {
  return (
    <SelectInput
      label="Statut"
      labelPosition="top"
      mode="base"
      value={statut}
      onChange={(event) => onChange(event.target.value as StatutDemande | "")}
      options={OPTIONS_STATUT}
    />
  );
};
