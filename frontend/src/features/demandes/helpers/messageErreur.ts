import { ErreurReseauOuServeur } from "../../../api/demandes";

const MESSAGE_ERREUR_GENERIQUE = "Une erreur est survenue. Veuillez réessayer.";

/**
 * Mutualisé entre DistributeurHome et DemandeDetailPage (même logique
 * d'affichage d'erreur dupliquée auparavant dans les deux pages).
 */
export const messageErreurAffichable = (erreur: unknown): string =>
  erreur instanceof ErreurReseauOuServeur ? erreur.message : MESSAGE_ERREUR_GENERIQUE;
