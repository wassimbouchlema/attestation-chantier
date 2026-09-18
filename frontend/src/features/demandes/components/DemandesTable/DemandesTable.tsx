import { Button, Pager, Table, TBody, Td, Th, THead, Tag, Tr } from "@axa-fr/canopee-react/distributeur";
import { Link } from "react-router-dom";

import type { Demande } from "../../../../api/demandes";
import { formatDate } from "../../../../helpers/formatDate";
import { LIBELLE_STATUT, VARIANT_STATUT } from "../../constants/statutLabel";

export const DemandesTable = ({
  demandes,
  page,
  nombreDePages,
  onPageChange,
  onSupprimer,
}: {
  demandes: Demande[];
  page: number;
  nombreDePages: number;
  onPageChange: (page: number) => void;
  onSupprimer: (id: string) => void;
}) => {
  return (
    <>
      <Table>
        <THead>
          <Tr>
            <Th scope="col">Statut</Th>
            <Th scope="col">Date de création</Th>
            <Th scope="col">Dernière modification</Th>
            <Th scope="col">Actions</Th>
          </Tr>
        </THead>
        <TBody>
          {demandes.map((demande) => (
            <Tr key={demande.id}>
              <Td>
                <Tag variant={VARIANT_STATUT[demande.statut]}>{LIBELLE_STATUT[demande.statut]}</Tag>
              </Td>
              <Td>{formatDate(demande.created_at)}</Td>
              <Td>{formatDate(demande.updated_at)}</Td>
              <Td>
                {demande.statut === "BROUILLON" ? (
                  <div className="demandes-table__actions">
                    <Link
                      to={`/distributeur/demandes/${demande.id}`}
                      aria-label={`Modifier la demande du ${formatDate(demande.created_at)}`}
                    >
                      Modifier
                    </Link>
                    <span aria-hidden="true">|</span>
                    <Button
                      variant="ghost"
                      aria-label={`Supprimer la demande du ${formatDate(demande.created_at)}`}
                      onClick={() => onSupprimer(demande.id)}
                    >
                      Supprimer
                    </Button>
                  </div>
                ) : (
                  <Link
                    to={`/distributeur/demandes/${demande.id}/consultation`}
                    aria-label={`Consulter la demande du ${formatDate(demande.created_at)}`}
                  >
                    Consulter
                  </Link>
                )}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {nombreDePages > 1 && (
        <Pager
          mode="light"
          currentPage={page}
          numberPages={nombreDePages}
          onChange={({ value }) => onPageChange(value)}
          elementsLabel="demandes"
        />
      )}
    </>
  );
};
