import { ErreurDemandeIntrouvable, ErreurDemandeNonModifiable, ErreurDossierIncomplet, ErreurFdrInvalide } from "../../../api/demandes";
import { messageErreurAffichable } from "../../demandes/helpers/messageErreur";
import { LIBELLE_CATEGORIE_PIECE } from "../constants/pieceLabel";

export interface ErreurEnvoiAffichable {
  titre: string;
  details: string[];
}

export const decrireErreurEnvoi = (erreur: unknown): ErreurEnvoiAffichable => {
  if (erreur instanceof ErreurDossierIncomplet) {
    return {
      titre: "Le dossier documentaire est incomplet.",
      details: erreur.piecesManquantes.map((categorie) => LIBELLE_CATEGORIE_PIECE[categorie]),
    };
  }
  if (erreur instanceof ErreurFdrInvalide) {
    return {
      titre: "Certaines informations du formulaire doivent être complétées ou corrigées.",
      details: Object.values(erreur.erreurs),
    };
  }
  if (erreur instanceof ErreurDemandeNonModifiable || erreur instanceof ErreurDemandeIntrouvable) {
    return { titre: erreur.message, details: [] };
  }
  return { titre: messageErreurAffichable(erreur), details: [] };
};
