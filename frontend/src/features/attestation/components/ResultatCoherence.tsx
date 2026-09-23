import { Restitution, Tag } from "@axa-fr/canopee-react/distributeur";

import type { ResultatCoherenceApi } from "../../../api/attestation";
import { formaterValeurCoherence } from "../helpers/formaterValeurCoherence";
import "./ResultatCoherence.css";

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
  <section aria-label="Résultat du contrôle de cohérence" className="resultat-coherence">
    <div className="resultat-coherence__statut">
      <Tag variant={resultat.coherent ? "success" : "warning"}>
        {resultat.coherent ? "Cohérent" : "Incohérences détectées"}
      </Tag>
    </div>
    <p className="resultat-coherence__resume">{resultat.resume}</p>
    {resultat.anomalies.map((anomalie, index) => (
      <article key={`${anomalie.champ}-${index}`} className="resultat-coherence__anomalie">
        <h3>{libellesChamps[anomalie.champ] ?? anomalie.champ}</h3>
        <div className="resultat-coherence__comparaison">
          <Restitution label="Valeur FDR">{formaterValeurCoherence(anomalie.champ, anomalie.valeur_fdr)}</Restitution>
          <Restitution label="Valeur attestation">
            {anomalie.valeur_attestation
              ? formaterValeurCoherence(anomalie.champ, anomalie.valeur_attestation)
              : "Information absente"}
          </Restitution>
        </div>
        <p className="resultat-coherence__message">{anomalie.message}</p>
      </article>
    ))}
    <p className="resultat-coherence__rappel">
      Ce contrôle est une aide à la vérification. La décision reste au SIÈGE.
    </p>
  </section>
);
