import { Button, Pager, Table, TBody, Td, Th, THead, Tag, Tr } from "@axa-fr/canopee-react/distributeur";
import { Link } from "react-router-dom";

import type { Demande } from "../../../../api/demandes";
import { formatDate } from "../../../../helpers/formatDate";
import { LIBELLE_DECISION } from "../../constants/optionsDecision";
import { LIBELLE_STATUT, VARIANT_STATUT } from "../../constants/statutLabel";
import "./DemandesTable.css";

export const DemandesTable = ({
  demandes,
  page,
  nombreDePages,
  onPageChange,
  onSupprimer,
  onTelechargerAttestation,
  attestationEnCours,
}: {
  demandes: Demande[];
  page: number;
  nombreDePages: number;
  onPageChange: (page: number) => void;
  onSupprimer: (id: string) => void;
  onTelechargerAttestation: (id: string) => void;
  attestationEnCours: boolean;
}) => {
  return (
    <div className="demandes-table">
      <Table>
        <THead>
          <Tr>
            <Th scope="col" className="demandes-table__col-identite">Assuré</Th>
            <Th scope="col" className="demandes-table__col-identite">Chantier</Th>
            <Th scope="col" className="demandes-table__col-statut">Statut</Th>
            <Th scope="col" className="demandes-table__col-decision">Décision</Th>
            <Th scope="col" className="demandes-table__col-date">Date de création</Th>
            <Th scope="col" className="demandes-table__col-actions">Actions</Th>
          </Tr>
        </THead>
        <TBody>
          {demandes.map((demande) => (
            <Tr key={demande.id}>
              <Td>{demande.assure_nom || "—"}</Td>
              <Td>{demande.chantier_nom || "—"}</Td>
              <Td className="demandes-table__cell-centre">
                <Tag variant={VARIANT_STATUT[demande.statut]}>{LIBELLE_STATUT[demande.statut]}</Tag>
              </Td>
              <Td className="demandes-table__cell-centre">
                {demande.decision ? LIBELLE_DECISION[demande.decision] : "—"}
              </Td>
              <Td className="demandes-table__cell-centre">{formatDate(demande.created_at)}</Td>
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
                  <div className="demandes-table__actions">
                    <Link
                      to={`/distributeur/demandes/${demande.id}/consultation`}
                      aria-label={`Consulter la demande du ${formatDate(demande.created_at)}`}
                    >
                      Consulter
                    </Link>
                    {demande.statut === "TRAITE" && demande.decision === "ACCEPTEE" && demande.attestation_finale && (
                      <>
                        <span aria-hidden="true">|</span>
                        <Button
                          variant="ghost"
                          aria-label={`Télécharger l'attestation de la demande du ${formatDate(demande.created_at)}`}
                          disabled={attestationEnCours}
                          onClick={() => onTelechargerAttestation(demande.id)}
                        >
                          Télécharger l'attestation
                        </Button>
                      </>
                    )}
                  </div>
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
    </div>
  );
};
