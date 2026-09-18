import logoAxa from "@axa-fr/canopee-css/logo-axa.svg";

import type { Utilisateur } from "../../../../api/auth";
import type { DemandeDetail } from "../../../../api/demandes";
import { formatDate } from "../../../../helpers/formatDate";
import "./DocumentGabarit.css";

const nomAgent = (agent: Utilisateur): string => {
  const nomComplet = `${agent.first_name} ${agent.last_name}`.trim();
  return nomComplet || agent.username;
};

/**
 * En-tête fixe du document, inspiré de la composition d'un courrier AXA
 * (agent à gauche, logo à droite, contrat/références, destinataire, objet).
 *
 * Seules des données réelles y figurent : agent connecté, FDR de la demande,
 * date du jour. Les informations qu'une attestation AXA réelle porte mais que
 * l'application ne détient pas (adresse et téléphone de l'agence, ORIAS,
 * SIREN, numéro client) sont volontairement absentes plutôt qu'inventées :
 * un bloc plus léger mais honnête.
 */
export const DocumentGabarit = ({ demande, agent }: { demande: DemandeDetail; agent: Utilisateur }) => {
  const { fdr } = demande;

  return (
    <header className="projet-attestation-gabarit">
      <div className="projet-attestation-gabarit__entete">
        <div>
          <p className="projet-attestation-gabarit__label">Votre agent général</p>
          <p>{nomAgent(agent)}</p>
        </div>
        <img src={logoAxa} alt="AXA" className="projet-attestation-gabarit__logo" />
      </div>

      <div className="projet-attestation-gabarit__colonnes">
        <div className="projet-attestation-gabarit__colonne">
          <p className="projet-attestation-gabarit__label">Votre contrat</p>
          <p>Attestation de chantier</p>

          <p className="projet-attestation-gabarit__label">Vos références</p>
          <p>Contrat n° {fdr.assure_numero_contrat}</p>
        </div>

        <div className="projet-attestation-gabarit__colonne">
          <p className="projet-attestation-gabarit__label">Assuré</p>
          <p>{fdr.assure_nom}</p>
          <p>{fdr.assure_ville}</p>

          <p className="projet-attestation-gabarit__label">Date du courrier</p>
          <p>{formatDate(new Date().toISOString())}</p>
        </div>
      </div>

      <div className="projet-attestation-gabarit__objet">
        <p className="projet-attestation-gabarit__label">Objet</p>
        <p>Attestation d'assurance — Chantier {fdr.chantier_nom}</p>
      </div>
    </header>
  );
};
