import { useState, type ComponentProps } from "react";
import type { UseFormReturn } from "react-hook-form";

import type { FileInput } from "@axa-fr/canopee-react/distributeur";

import { ErreurDocumentInvalide, ErreurExtractionIndisponible } from "../../../../api/extraction";
import { messageErreurAffichable } from "../../../demandes/helpers/messageErreur";
import { depuisResultatExtraction, type ChampPreremplissageFdr } from "../../helpers/depuisResultatExtraction";
import { useExtraireDocumentFdr } from "../../queries";
import type { FdrFormValues } from "../../types/FdrFormValues";

type FileInputProps = ComponentProps<typeof FileInput>;
type ValeurFichier = NonNullable<FileInputProps["values"]>[number];
type ErreurFichierNavigateur = NonNullable<FileInputProps["errors"]>[number];
type ChangementFileInput = Parameters<NonNullable<FileInputProps["onChange"]>>[0];

const ID_CHAMP_FICHIER = "preremplissage-document-input";

const messageErreurExtraction = (erreur: unknown): string => {
  if (erreur instanceof ErreurDocumentInvalide) {
    return "Ce fichier ne peut pas être analysé. Vérifiez qu'il s'agit bien d'un PDF.";
  }
  if (erreur instanceof ErreurExtractionIndisponible) {
    return "Le service d'extraction est momentanément indisponible. Vous pouvez réessayer ou continuer en saisie manuelle.";
  }
  return messageErreurAffichable(erreur);
};

/**
 * `champ` est un des 14 noms de `ChampExtractibleFdr`, tous des clés valides
 * de `FdrFormValues` dont la valeur est une chaîne — mais ce sous-ensemble
 * n'est connu qu'à l'exécution (issu de l'extraction), pas d'un littéral, ce
 * que le typage générique de `setValue` de React Hook Form n'accepte pas.
 */
type SetValueChampExtractible = (
  champ: ChampPreremplissageFdr["champ"],
  valeur: string,
  options?: { shouldValidate?: boolean },
) => void;

interface ChampApplique {
  champ: ChampPreremplissageFdr["champ"];
  valeurAppliquee: string;
  valeurAnterieure: string;
}

export const usePreremplissageDocumentSection = (
  methods: UseFormReturn<FdrFormValues>,
  recalculerSectionsDepuisLesValeurs: () => void,
) => {
  const [valeursFichier, setValeursFichier] = useState<ValeurFichier[]>([]);
  const [erreursNavigateur, setErreursNavigateur] = useState<ErreurFichierNavigateur[]>([]);
  const [fichier, setFichier] = useState<File | null>(null);
  const [resumeApplication, setResumeApplication] = useState<{ completes: number; conservees: number } | null>(null);
  const [champsAppliques, setChampsAppliques] = useState<ChampApplique[] | null>(null);
  const extractionMutation = useExtraireDocumentFdr();

  const reinitialiser = () => {
    setValeursFichier([]);
    setErreursNavigateur([]);
    setFichier(null);
    setResumeApplication(null);
    setChampsAppliques(null);
    extractionMutation.reset();
  };

  const handleChangeFichier = ({ values, errors, fileAction }: ChangementFileInput) => {
    if (fileAction === "delete") {
      reinitialiser();
      return;
    }

    setErreursNavigateur((errors ?? []).map((erreur) => erreur.file));
    if (values.length === 0) {
      return;
    }
    setValeursFichier(values);
    setResumeApplication(null);
    extractionMutation.reset();

    // Même contournement que `usePieceUploadField` : `values[0].file` n'est
    // pas un vrai `File` (Canopée le reconstruit sans données binaires).
    const fichierReel = (document.getElementById(ID_CHAMP_FICHIER) as HTMLInputElement | null)?.files?.[0];
    setFichier(fichierReel ?? null);
  };

  const analyser = () => {
    if (!fichier) {
      return;
    }
    extractionMutation.mutate(fichier);
  };

  const champsDetectes: ChampPreremplissageFdr[] = extractionMutation.data
    ? depuisResultatExtraction(extractionMutation.data)
    : [];

  const appliquer = () => {
    const valeursActuelles = methods.getValues();
    const setValeurChamp = methods.setValue as unknown as SetValueChampExtractible;
    const nouveauxChampsAppliques: ChampApplique[] = [];
    let completes = 0;
    let conservees = 0;

    for (const { champ, valeurFormulaire } of champsDetectes) {
      const valeurActuelle = valeursActuelles[champ];
      const estVide = valeurActuelle === "" || valeurActuelle === null || valeurActuelle === undefined;
      if (estVide) {
        // `shouldValidate` : sans cela, un message d'erreur affiché avant
        // l'import (champ vide requis) resterait visible après coup, RHF ne
        // revalidant pas automatiquement un `setValue` programmatique.
        setValeurChamp(champ, valeurFormulaire, { shouldValidate: true });
        nouveauxChampsAppliques.push({ champ, valeurAppliquee: valeurFormulaire, valeurAnterieure: valeurActuelle ?? "" });
        completes += 1;
      } else {
        conservees += 1;
      }
    }

    setChampsAppliques(nouveauxChampsAppliques);
    setResumeApplication({ completes, conservees });
  };

  // Une valeur encore égale à celle appliquée n'a pas été retouchée par
  // l'utilisateur depuis : elle peut revenir à sa valeur antérieure. Une
  // valeur différente a été modifiée manuellement et doit être respectée.
  //
  // `setValue` seul ne met à jour que React Hook Form : `sectionsValidees`/
  // `sectionActive` (useFdrSectionsEtat) sont un état React séparé, qui ne
  // se recalcule que sur `validerSection()`/`verifierEtValider()`. Sans ce
  // recalcul explicite, une section resterait affichée en restitution avec
  // des champs redevenus vides (d'où les `undefined`/`0,00 €` observés).
  const reinitialiserPreremplissage = () => {
    const valeursActuelles = methods.getValues();
    const setValeurChamp = methods.setValue as unknown as SetValueChampExtractible;

    for (const { champ, valeurAppliquee, valeurAnterieure } of champsAppliques ?? []) {
      if (valeursActuelles[champ] === valeurAppliquee) {
        setValeurChamp(champ, valeurAnterieure);
      }
    }

    reinitialiser();
    recalculerSectionsDepuisLesValeurs();
  };

  return {
    idChampFichier: ID_CHAMP_FICHIER,
    valeursFichier,
    erreursNavigateur,
    handleChangeFichier,
    fichierSelectionne: fichier !== null,
    analyser,
    analyseEnCours: extractionMutation.isPending,
    resultatDisponible: extractionMutation.isSuccess,
    champsDetectes,
    aucuneInformationTrouvee: extractionMutation.isSuccess && champsDetectes.length === 0,
    erreurExtraction: extractionMutation.isError ? messageErreurExtraction(extractionMutation.error) : null,
    resumeApplication,
    preremplissageApplique: resumeApplication !== null,
    appliquer,
    reinitialiserPreremplissage,
    ignorer: reinitialiser,
  };
};
