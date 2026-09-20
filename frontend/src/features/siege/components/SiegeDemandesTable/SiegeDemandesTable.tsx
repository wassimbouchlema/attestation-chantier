import { Pager, Table, TBody, Td, Th, THead, Tr } from "@axa-fr/canopee-react/distributeur";
import { Link } from "react-router-dom";

import type { DemandeDetail } from "../../../../api/demandes";
import { formatDate } from "../../../../helpers/formatDate";
import { LIBELLE_STATUT } from "../../../demandes/constants/statutLabel";

export const SiegeDemandesTable = ({
  demandes,
  page,
  nombreDePages,
  onPageChange,
}: {
  demandes: DemandeDetail[];
  page: number;
  nombreDePages: number;
  onPageChange: (page: number) => void;
}) => {
  return (
    <>
      <Table>
        <THead>
          <Tr>
            <Th scope="col">Assuré</Th>
            <Th scope="col">Chantier</Th>
            <Th scope="col">Date d'envoi</Th>
            <Th scope="col">Dernière modification</Th>
            <Th scope="col">Statut</Th>
            <Th scope="col">Actions</Th>
          </Tr>
        </THead>
        <TBody>
          {demandes.map((demande) => (
            <Tr key={demande.id}>
              <Td>{demande.fdr.assure_nom}</Td>
              <Td>{demande.fdr.chantier_nom}</Td>
              <Td>{demande.envoye_at ? formatDate(demande.envoye_at) : "—"}</Td>
              <Td>{formatDate(demande.updated_at)}</Td>
              <Td>
                {LIBELLE_STATUT[demande.statut]}
              </Td>
              <Td>
                <Link
                  to={`/siege/demandes/${demande.id}`}
                  aria-label={`Traiter la demande de ${demande.fdr.assure_nom || "assuré non renseigné"}`}
                >
                  Traiter
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
