import { Button, Loader, Message, Table, TBody, Td, Th, THead, Title, Tr } from "@axa-fr/canopee-react/distributeur";

import { formatDate } from "../../../../helpers/formatDate";
import { Surface } from "../../../../layout/Surface";
import { LIBELLE_CATEGORIE_PIECE } from "../../constants/pieceLabel";
import { PieceUploadField } from "../PieceUploadField/PieceUploadField";
import { usePiecesJustificativesSection } from "./usePiecesJustificativesSection";

export const PiecesJustificativesSection = ({
  demandeId,
  lectureSeule,
}: {
  demandeId: string;
  lectureSeule: boolean;
}) => {
  const {
    isLoading,
    erreurChargement,
    reessayerChargement,
    dossierCharge,
    dossierComplet,
    piecesRequises,
    piecesManquantes,
    pieces,
    supprimerPiece,
    pieceEnSuppression,
    erreurSuppression,
    fermerErreurSuppression,
  } = usePiecesJustificativesSection(demandeId);

  return (
    <Surface>
      <Title heading="h2">Pièces justificatives</Title>

      {isLoading && <Loader mode="get">{null}</Loader>}

      {erreurChargement && (
        <div role="alert">
          <p>{erreurChargement}</p>
          <Button variant="secondary" onClick={reessayerChargement}>
            Réessayer
          </Button>
        </div>
      )}

      {dossierCharge && (
        <>
          {dossierComplet ? (
            <Message variant="success" title="Dossier complet">
              {piecesRequises.length === 0
                ? "Aucune pièce justificative requise pour les informations renseignées."
                : "Toutes les pièces justificatives requises ont été transmises."}
            </Message>
          ) : (
            <Message variant="warning" title="Dossier incomplet">
              <p>Catégories de pièces manquantes :</p>
              <ul>
                {piecesManquantes.map((categorie) => (
                  <li key={categorie}>{LIBELLE_CATEGORIE_PIECE[categorie]}</li>
                ))}
              </ul>
            </Message>
          )}

          {!lectureSeule && piecesRequises.length > 0 && (
            <div className="fdr-pieces-uploads">
              {piecesRequises.map((categorie) => (
                <PieceUploadField key={categorie} demandeId={demandeId} categorie={categorie} />
              ))}
            </div>
          )}

          {pieces.length > 0 && (
            <Table>
              <THead>
                <Tr>
                  <Th scope="col">Catégorie</Th>
                  <Th scope="col">Fichier</Th>
                  <Th scope="col">Date d'envoi</Th>
                  {!lectureSeule && (
                    <Th scope="col">
                      <span className="sr-only">Action</span>
                    </Th>
                  )}
                </Tr>
              </THead>
              <TBody>
                {pieces.map((piece) => (
                  <Tr key={piece.id}>
                    <Td>{LIBELLE_CATEGORIE_PIECE[piece.type_piece]}</Td>
                    <Td>{piece.nom_fichier_original}</Td>
                    <Td>{formatDate(piece.uploaded_at)}</Td>
                    {!lectureSeule && (
                      <Td>
                        <Button
                          variant="danger"
                          small
                          aria-label={`Supprimer ${piece.nom_fichier_original}`}
                          disabled={pieceEnSuppression === piece.id}
                          onClick={() => supprimerPiece(piece.id)}
                        >
                          Supprimer
                        </Button>
                      </Td>
                    )}
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}

          {erreurSuppression && (
            <Message
              title={erreurSuppression}
              variant="error"
              onClose={fermerErreurSuppression}
              closeButtonAriaLabel="Fermer"
            />
          )}
        </>
      )}
    </Surface>
  );
};
