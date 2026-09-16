import { Button, EditorialMessage, Loader, MainContainer, Message } from "@axa-fr/canopee-react/distributeur";
import assignmentIcon from "@material-symbols/svg-400/outlined/assignment.svg";
import { useNavigate, useSearchParams } from "react-router-dom";

import { TAILLE_PAGE, type StatutDemande } from "../../api/demandes";
import { DemandesFilter } from "../../features/demandes/components/DemandesFilter/DemandesFilter";
import { DemandesTable } from "../../features/demandes/components/DemandesTable/DemandesTable";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { parseFiltresListe } from "../../features/demandes/helpers/parseFiltresListe";
import { useCreerDemande, useDemandes } from "../../features/demandes/queries";
import { PageHeader } from "../../layout/PageHeader";
import { Surface } from "../../layout/Surface";
import { useDocumentTitle } from "../../layout/useDocumentTitle";

export const DistributeurHome = () => {
  useDocumentTitle("Mes demandes");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { statut, page } = parseFiltresListe(searchParams);
  const { data, isLoading, isError, error, refetch } = useDemandes({ statut, page });
  const creerDemandeMutation = useCreerDemande();

  const demandes = data?.results ?? [];
  const total = data?.count ?? 0;
  const nombreDePages = Math.max(1, Math.ceil(total / TAILLE_PAGE));

  const definirStatut = (nouveauStatut: StatutDemande | "") => {
    setSearchParams((precedent) => {
      const suivant = new URLSearchParams(precedent);
      if (nouveauStatut) {
        suivant.set("statut", nouveauStatut);
      } else {
        suivant.delete("statut");
      }
      suivant.delete("page");
      return suivant;
    });
  };

  const definirPage = (nouvellePage: number) => {
    setSearchParams((precedent) => {
      const suivant = new URLSearchParams(precedent);
      if (nouvellePage > 1) {
        suivant.set("page", String(nouvellePage));
      } else {
        suivant.delete("page");
      }
      return suivant;
    });
  };

  const handleNouvelleDemande = () => {
    if (creerDemandeMutation.isPending) {
      return;
    }
    creerDemandeMutation.mutate(undefined, {
      onSuccess: (demande) => navigate(`/distributeur/demandes/${demande.id}`),
    });
  };

  return (
    <>
      <PageHeader
        title="Mes demandes"
        subtitle="Suivez et gérez vos demandes d'attestation de chantier."
        actions={
          <Button variant="primary" onClick={handleNouvelleDemande} disabled={creerDemandeMutation.isPending}>
            {creerDemandeMutation.isPending ? "Création…" : "Nouvelle demande"}
          </Button>
        }
      />
      <MainContainer>
        <div className="container-fluid app-shell__content">
          {creerDemandeMutation.isPending && (
            <p role="status" className="sr-only">
              Création de la demande en cours…
            </p>
          )}
          {creerDemandeMutation.isError && (
            <Message
              title={messageErreurAffichable(creerDemandeMutation.error)}
              variant="error"
              onClose={() => creerDemandeMutation.reset()}
              closeButtonAriaLabel="Fermer"
            />
          )}

          <Surface>
            <DemandesFilter statut={statut} onChange={definirStatut} />
          </Surface>

          {isLoading && <Loader mode="get">{null}</Loader>}

          {!isLoading && isError && (
            <Surface>
              <div role="alert">
                <p>{messageErreurAffichable(error)}</p>
                <Button variant="secondary" onClick={() => refetch()}>
                  Réessayer
                </Button>
              </div>
            </Surface>
          )}

          {!isLoading && !isError && demandes.length === 0 && statut === "" && (
            <Surface>
              <EditorialMessage type="information" icon={assignmentIcon} title="Aucune demande pour le moment.">
                Les demandes que vous créez apparaîtront ici.
              </EditorialMessage>
            </Surface>
          )}

          {!isLoading && !isError && demandes.length === 0 && statut !== "" && (
            <Surface>
              <EditorialMessage type="information" icon={assignmentIcon} title="Aucune demande ne correspond à ce filtre.">
                Essayez un autre statut.
              </EditorialMessage>
            </Surface>
          )}

          {!isLoading && !isError && demandes.length > 0 && (
            <DemandesTable demandes={demandes} page={page} nombreDePages={nombreDePages} onPageChange={definirPage} />
          )}
        </div>
      </MainContainer>
    </>
  );
};
