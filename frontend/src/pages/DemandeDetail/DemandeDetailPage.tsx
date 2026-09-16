import { Loader, MainContainer, Tag } from "@axa-fr/canopee-react/distributeur";
import { Link, useParams } from "react-router-dom";

import { ErreurDemandeIntrouvable } from "../../api/demandes";
import { LIBELLE_STATUT, VARIANT_STATUT } from "../../features/demandes/constants/statutLabel";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { useDemande } from "../../features/demandes/queries";
import { formatDate } from "../../helpers/formatDate";
import { PageHeader } from "../../layout/PageHeader";
import { Surface } from "../../layout/Surface";
import { useDocumentTitle } from "../../layout/useDocumentTitle";

/**
 * Page de destination minimale d'une demande : uniquement les données
 * réellement renvoyées par GET /api/demandes/{id}/ (statut, dates,
 * identifiant). Pas de FDR ici — cette route deviendra le parcours FDR
 * dans une prochaine verticale.
 */
export const DemandeDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data: demande, isLoading, isError, error } = useDemande(id);

  useDocumentTitle(demande ? `Demande du ${formatDate(demande.created_at)}` : "Détail de la demande");

  const introuvable = error instanceof ErreurDemandeIntrouvable;

  return (
    <>
      <PageHeader title={demande ? `Demande du ${formatDate(demande.created_at)}` : "Détail de la demande"} />
      <MainContainer>
        <div className="container app-shell__content">
          {isLoading && <Loader mode="get">{null}</Loader>}

          {!isLoading && introuvable && (
            <Surface>
              <div role="alert">
                <p>Cette demande est introuvable.</p>
              </div>
              <Link to="/distributeur">Retour à mes demandes</Link>
            </Surface>
          )}

          {!isLoading && isError && !introuvable && (
            <Surface>
              <div role="alert">
                <p>{messageErreurAffichable(error)}</p>
              </div>
            </Surface>
          )}

          {!isLoading && demande && (
            <Surface>
              <p>
                Statut : <Tag variant={VARIANT_STATUT[demande.statut]}>{LIBELLE_STATUT[demande.statut]}</Tag>
              </p>
              <p>Créée le {formatDate(demande.created_at)}</p>
              <p>Dernière modification le {formatDate(demande.updated_at)}</p>
              <p className="demande-detail__id">Identifiant : {demande.id}</p>
              <Link to="/distributeur">Retour à mes demandes</Link>
            </Surface>
          )}
        </div>
      </MainContainer>
    </>
  );
};
