import { FileInput, Message } from "@axa-fr/canopee-react/distributeur";

import type { CategoriePiece } from "../../../../api/pieces";
import { LIBELLE_CATEGORIE_PIECE } from "../../constants/pieceLabel";
import { usePieceUploadField } from "./usePieceUploadField";


const ACCEPT_PIECES = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

export const PieceUploadField = ({
  demandeId,
  categorie,
  disabled,
}: {
  demandeId: string;
  categorie: CategoriePiece;
  disabled?: boolean;
}) => {
  const {
    idChampFichier,
    valeurs,
    erreursNavigateur,
    handleChange,
    televersementEnCours,
    erreurTeleversement,
    fermerErreurTeleversement,
  } = usePieceUploadField(demandeId, categorie);

  return (
    <div className="fdr-piece-upload">
      <FileInput
        id={idChampFichier}
        label={LIBELLE_CATEGORIE_PIECE[categorie]}
        labelPosition="top"
        fileLabel="Parcourir"
        values={valeurs}
        errors={erreursNavigateur}
        accept={ACCEPT_PIECES}
        multiple={false}
        maxSize={Number.MAX_SAFE_INTEGER}
        disabled={disabled || televersementEnCours}
        onChange={handleChange}
      />
      {erreurTeleversement && (
        <Message
          title={erreurTeleversement}
          variant="error"
          onClose={fermerErreurTeleversement}
          closeButtonAriaLabel="Fermer"
        />
      )}
    </div>
  );
};
