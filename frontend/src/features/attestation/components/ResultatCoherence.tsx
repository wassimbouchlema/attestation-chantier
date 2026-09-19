import { Message, Restitution, Tag } from "@axa-fr/canopee-react/distributeur";

import type { ResultatCoherenceApi } from "../../../api/attestation";

const libellesChamps: Record<string, string> = {
  assure_nom: "Nom de l'assuré",
  assure_ville: "Ville de l'assuré",
  assure_numero_contrat: "Numéro de contrat",
  chantier_nom: "Nom du chantier",
  chantier_ville: "Ville du chantier",
  type_chantier: "Type de chantier",
  chantier_atypique: "Caractère atypique du chantier",
  modification_structure: "Modification de structure",
  usage: "Usage",
  usage_autre_texte: "Précisions sur l'usage",
  date_debut: "Date de début",
  date_fin: "Date de fin",
  montant_total: "Montant total du chantier",
  intervention_description: "Description de l'intervention",
  intervention_montant_prestation: "Montant de la prestation",
  intervention_type: "Type d'intervention",
  activite_couverte: "Activité couverte",
  activite_non_couverte_texte: "Précisions sur l'activité non couverte",
  travaux_standards: "Travaux standards",
};

export const ResultatCoherence = ({ resultat }: { resultat: ResultatCoherenceApi }) => (
  <section aria-label="Résultat du contrôle de cohérence">
    {resultat.backend === "simulation" && <Tag variant="information">Analyse simulée</Tag>}
    <Tag variant={resultat.coherent ? "success" : "warning"}>
      {resultat.coherent ? "Cohérent" : "Incohérences détectées"}
    </Tag>
    <Message variant={resultat.coherent ? "success" : "warning"} title={resultat.resume} />
    {resultat.anomalies.map((anomalie, index) => (
      <section key={`${anomalie.champ}-${index}`}>
        <h3>{libellesChamps[anomalie.champ] ?? anomalie.champ}</h3>
        <Restitution label="Valeur FDR">{anomalie.valeur_fdr}</Restitution>
        <Restitution label="Valeur attestation">{anomalie.valeur_attestation || "Information absente"}</Restitution>
        <p>{anomalie.message}</p>
      </section>
    ))}
    <p>Ce contrôle est une aide à la vérification. La décision reste au SIÈGE.</p>
  </section>
);
