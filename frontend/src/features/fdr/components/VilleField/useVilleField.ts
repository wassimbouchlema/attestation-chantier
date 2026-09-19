import { useCallback, useEffect, useRef, useState } from "react";

import { rechercherCommunes } from "../../../../api/communes";

export const SEUIL_RECHERCHE = 2;
export const DELAI_DEBOUNCE_MS = 300;
const SEPARATEUR = "::";

export interface OptionVille {
  value: string;
  label: string;
}

const versOption = (nom: string, codePostal: string): OptionVille => ({
  value: `${nom}${SEPARATEUR}${codePostal}`,
  label: codePostal ? `${nom} (${codePostal})` : nom,
});

const nomDepuisOption = (valeur: string): string => valeur.split(SEPARATEUR)[0];

/** Recherche debouncée avec annulation ; le nom de la commune reste la seule valeur stockée dans le FDR. */
export const useVilleField = (valeurFdr: string, onValeurChange: (nom: string) => void) => {
  const [selection, setSelection] = useState<OptionVille | null>(null);
  const minuteurRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const controleurRef = useRef<AbortController>(undefined);
  const libellesRef = useRef(new Map<string, string>());

  useEffect(
    () => () => {
      clearTimeout(minuteurRef.current);
      controleurRef.current?.abort();
    },
    [],
  );

  const chargerOptions = useCallback(
    (saisie: string) =>
      new Promise<OptionVille[]>((resolve) => {
        clearTimeout(minuteurRef.current);
        controleurRef.current?.abort();
        const terme = saisie.trim();
        if (terme.length < SEUIL_RECHERCHE) {
          resolve([]);
          return;
        }
        minuteurRef.current = setTimeout(async () => {
          const controleur = new AbortController();
          controleurRef.current = controleur;
          try {
            const communes = await rechercherCommunes(terme, controleur.signal);
            const options = communes.map((commune) => versOption(commune.nom, commune.codePostal));
            options.forEach((option) => libellesRef.current.set(option.value, option.label));
            resolve(options);
          } catch {
            resolve(
              controleur.signal.aborted
                ? []
                : [{ value: terme, label: `Suggestions indisponibles : utiliser « ${terme} »` }],
            );
          }
        }, DELAI_DEBOUNCE_MS);
      }),
    [],
  );

  const optionCourante: OptionVille[] = valeurFdr
    ? [selection && nomDepuisOption(selection.value) === valeurFdr ? selection : versOption(valeurFdr, "")]
    : [];

  const selectionner = (valeur: string | undefined) => {
    if (!valeur) {
      setSelection(null);
      onValeurChange("");
      return;
    }
    const nom = nomDepuisOption(valeur);
    setSelection({ value: valeur, label: libellesRef.current.get(valeur) ?? nom });
    onValeurChange(nom);
  };

  return { chargerOptions, optionCourante, selectionner };
};
