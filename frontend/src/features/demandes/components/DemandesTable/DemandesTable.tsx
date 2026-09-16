import { Pager, Table, TBody, Td, Th, THead, Tag, Tr } from "@axa-fr/canopee-react/distributeur";
import { Link } from "react-router-dom";

import type { Demande } from "../../../../api/demandes";
import { formatDate } from "../../../../helpers/formatDate";
import { LIBELLE_STATUT, VARIANT_STATUT } from "../../constants/statutLabel";

export const DemandesTable = ({
  demandes,
  page,
  nombreDePages,
  onPageChange,
}: {
  demandes: Demande[];
  page: number;
  nombreDePages: number;
  onPageChange: (page: number) => void;
}) => {
  return (
    <>
      <Table>
        <THead>
          <Tr>
            <Th scope="col">Statut</Th>
            <Th scope="col">Date de création</Th>
            <Th scope="col">Dernière modification</Th>
            <Th scope="col">
              <span className="sr-only">Action</span>
            </Th>
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
                <Link
                  to={`/distributeur/demandes/${demande.id}`}
                  aria-label={`Ouvrir la demande du ${formatDate(demande.created_at)}`}
                >
                  Ouvrir
                </Link>
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
