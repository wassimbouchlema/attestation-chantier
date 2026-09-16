import { EditorialMessage, MainContainer } from "@axa-fr/canopee-react/distributeur";
import assignmentIcon from "@material-symbols/svg-400/outlined/assignment.svg";

import { useDocumentTitle } from "../../layout/useDocumentTitle";
import { PageHeader } from "../../layout/PageHeader";
import { Surface } from "../../layout/Surface";

export const SiegeHome = () => {
  useDocumentTitle("Demandes à traiter");

  return (
    <>
      <PageHeader
        title="Demandes à traiter"
        subtitle="Consultez et traitez les demandes d'attestation transmises par les distributeurs."
      />
      <MainContainer>
        <div className="container-fluid app-shell__content">
          <Surface>
            <EditorialMessage type="information" icon={assignmentIcon} title="Aucune demande pour le moment.">
              Les demandes transmises par les distributeurs apparaîtront ici.
            </EditorialMessage>
          </Surface>
        </div>
      </MainContainer>
    </>
  );
};
