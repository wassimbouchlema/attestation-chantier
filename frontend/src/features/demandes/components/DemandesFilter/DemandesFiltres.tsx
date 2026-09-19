import { SelectInput } from "@axa-fr/canopee-react/distributeur";

import type { FiltreComplements, FiltreDecision, StatutDemande } from "../../../../api/demandes";
import type { FiltresListe } from "../../helpers/parseFiltresListe";
import { OPTIONS_COMPLEMENTS, OPTIONS_DECISION } from "../../constants/optionsDecision";
import { OPTIONS_STATUT } from "../../constants/optionsStatut";
import "./DemandesFiltres.css";

export const DemandesFiltres = ({
  filtres,
  onStatutChange,
  onDecisionChange,
  onComplementsChange,
}: {
  filtres: FiltresListe;
  onStatutChange: (statut: StatutDemande | "") => void;
  onDecisionChange: (decision: FiltreDecision | "") => void;
  onComplementsChange: (complements: FiltreComplements | "") => void;
}) => {
  return (
    <div className="demandes-filtres" role="group" aria-label="Filtres">
      <SelectInput
        label="Statut"
        labelPosition="center"
        mode="base"
        value={filtres.statut}
        onChange={(event) => onStatutChange(event.target.value as StatutDemande | "")}
        options={OPTIONS_STATUT}
      />
      <SelectInput
        label="Décision"
        labelPosition="center"
        mode="base"
        value={filtres.decision}
        onChange={(event) => onDecisionChange(event.target.value as FiltreDecision | "")}
        options={OPTIONS_DECISION}
      />
      <SelectInput
        label="Compléments"
        labelPosition="center"
        mode="base"
        value={filtres.complements}
        onChange={(event) => onComplementsChange(event.target.value as FiltreComplements | "")}
        options={OPTIONS_COMPLEMENTS}
      />
    </div>
  );
};
