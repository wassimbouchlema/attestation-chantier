import type { FormulaireRisqueApi } from "../../../api/demandes";
import { formatDateFr } from "./formatDateFr";
import { formatMontant } from "./formatMontant";
import { libelleOuiNon } from "./libelleOuiNon";
import { OPTIONS_INTERVENTION_TYPE } from "../constants/optionsInterventionType";
import { OPTIONS_TYPE_CHANTIER } from "../constants/optionsTypeChantier";
import { OPTIONS_USAGE } from "../constants/optionsUsage";

export interface LigneRecapitulatif {
  label: string;
  valeur: string;
}

export interface SectionRecapitulatif {
  titre: string;
  lignes: LigneRecapitulatif[];
}

const NON_RENSEIGNE = "Non renseigné";

const texte = (valeur: string): string => valeur || NON_RENSEIGNE;
const date = (valeur: string | null): string => (valeur ? formatDateFr(valeur) : NON_RENSEIGNE);
const montant = (valeur: string | null): string => (valeur !== null ? formatMontant(valeur) : NON_RENSEIGNE);
const libelle = <T extends string>(options: readonly { value: T; label: string }[], valeur: T): string =>
  options.find((option) => option.value === valeur)?.label ?? NON_RENSEIGNE;

export const construireRecapitulatifFdr = (fdr: FormulaireRisqueApi): SectionRecapitulatif[] => [
  {
    titre: "Assuré",
    lignes: [
      { label: "Nom / raison sociale", valeur: texte(fdr.assure_nom) },
      { label: "Ville", valeur: texte(fdr.assure_ville) },
      { label: "Numéro de contrat", valeur: texte(fdr.assure_numero_contrat) },
    ],
  },
  {
    titre: "Chantier",
    lignes: [
      { label: "Nom du chantier", valeur: texte(fdr.chantier_nom) },
      { label: "Ville", valeur: texte(fdr.chantier_ville) },
      { label: "Type de chantier", valeur: libelle(OPTIONS_TYPE_CHANTIER, fdr.type_chantier) },
      ...(fdr.type_chantier === "RENOVATION"
        ? [{ label: "Modification de structure", valeur: libelleOuiNon(fdr.modification_structure) }]
        : []),
      { label: "Chantier atypique", valeur: libelleOuiNon(fdr.chantier_atypique) },
    ],
  },
  {
    titre: "Usage & calendrier",
    lignes: [
      {
        label: "Usage",
        valeur:
          libelle(OPTIONS_USAGE, fdr.usage) +
          (fdr.usage === "AUTRE" && fdr.usage_autre_texte ? ` — ${fdr.usage_autre_texte}` : ""),
      },
      { label: "Date de début", valeur: date(fdr.date_debut) },
      { label: "Date de fin", valeur: date(fdr.date_fin) },
      { label: "Montant total", valeur: montant(fdr.montant_total) },
    ],
  },
  {
    titre: "Intervention",
    lignes: [
      { label: "Description", valeur: texte(fdr.intervention_description) },
      { label: "Montant de la prestation", valeur: montant(fdr.intervention_montant_prestation) },
      { label: "Type d'intervention", valeur: libelle(OPTIONS_INTERVENTION_TYPE, fdr.intervention_type) },
    ],
  },
  {
    titre: "Questions métier",
    lignes: [
      {
        label: "Activité couverte par le contrat",
        valeur:
          libelleOuiNon(fdr.activite_couverte) +
          (fdr.activite_couverte === false && fdr.activite_non_couverte_texte
            ? ` — ${fdr.activite_non_couverte_texte}`
            : ""),
      },
      { label: "Travaux standards", valeur: libelleOuiNon(fdr.travaux_standards) },
    ],
  },
];
