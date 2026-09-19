import { Button } from "@axa-fr/canopee-react/distributeur";

import type { PieceJustificativeApi } from "../../../../api/pieces";
import "./PieceActions.css";
import { usePieceActions } from "./usePieceActions";

/** Consultation seule (SIÈGE) d'une pièce déjà transmise : aucune suppression, aucun remplacement. */
export const PieceActions = ({ demandeId, piece }: { demandeId: string; piece: PieceJustificativeApi }) => {
  const { previsualiser, telecharger, enCours } = usePieceActions(demandeId, piece);

  return (
    <div className="piece-actions">
      <Button
        variant="ghost"
        small
        onClick={previsualiser}
        disabled={enCours}
        aria-label={`Prévisualiser ${piece.nom_fichier_original}`}
      >
        Prévisualiser
      </Button>
      <span aria-hidden="true">|</span>
      <Button
        variant="ghost"
        small
        onClick={telecharger}
        disabled={enCours}
        aria-label={`Télécharger ${piece.nom_fichier_original}`}
      >
        Télécharger
      </Button>
    </div>
  );
};
