import { Button, Loader, Restitution, Table, TBody, Td, Th, THead, Title, Tag, Tr } from "@axa-fr/canopee-react/distributeur";

import { formatDate } from "../../../../helpers/formatDate";
import { Surface } from "../../../../layout/Surface";
import { LIBELLE_CATEGORIE_PIECE } from "../../constants/pieceLabel";
import { useSyntheseDossierPieces } from "./useSyntheseDossierPieces";

export const SyntheseDossierPieces = ({
  demandeId,
  afficherTableau = false,
  onRetourPieces,
}: {
  demandeId: string;
  afficherTableau?: boolean;
  onRetourPieces?: () => void;
}) => {
  const { isLoading, erreurChargement, reessayerChargement, dossierCharge, dossierComplet, piecesRequises, piecesManquantes, pieces } =
    useSyntheseDossierPieces(demandeId);

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
          <div className="fdr-step-contenu fdr-step-contenu--restitution">
            <Restitution label="Statut du dossier">
              <Tag variant={dossierComplet ? "success" : "warning"}>{dossierComplet ? "Complet" : "Incomplet"}</Tag>
            </Restitution>
            <Restitution label="Pièces transmises">{pieces.length}</Restitution>
            <Restitution label="Pièces requises">{piecesRequises.length}</Restitution>
          </div>

          {!dossierComplet && (
            <>
              <Title heading="h3">Pièces manquantes</Title>
              <ul>
                {piecesManquantes.map((categorie) => (
                  <li key={categorie}>{LIBELLE_CATEGORIE_PIECE[categorie]}</li>
                ))}
              </ul>
              {onRetourPieces && (
                <Button variant="secondary" onClick={onRetourPieces}>
                  Retour aux pièces justificatives
                </Button>
              )}
            </>
          )}

          {afficherTableau && pieces.length > 0 && (
            <Table>
              <THead>
                <Tr>
                  <Th scope="col">Catégorie</Th>
                  <Th scope="col">Fichier</Th>
                  <Th scope="col">Date d'ajout</Th>
                </Tr>
              </THead>
              <TBody>
                {pieces.map((piece) => (
                  <Tr key={piece.id}>
                    <Td>{LIBELLE_CATEGORIE_PIECE[piece.type_piece]}</Td>
                    <Td>{piece.nom_fichier_original}</Td>
                    <Td>{formatDate(piece.uploaded_at)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </>
      )}
    </Surface>
  );
};
