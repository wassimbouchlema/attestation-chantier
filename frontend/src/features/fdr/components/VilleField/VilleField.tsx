import { MultiSelectInput } from "@axa-fr/canopee-react/distributeur";
import { Controller, useFormContext } from "react-hook-form";

import type { FdrFormValues } from "../../types/FdrFormValues";
import "./VilleField.css";
import { SEUIL_RECHERCHE, useVilleField, type OptionVille } from "./useVilleField";

const messageAucunResultat = ({ inputValue }: { inputValue: string }) =>
  inputValue.trim().length < SEUIL_RECHERCHE
    ? `Saisissez au moins ${SEUIL_RECHERCHE} caractères`
    : `Aucune commune trouvée pour « ${inputValue.trim()} »`;

const ChampVille = ({
  name,
  label,
  valeur,
  message,
  onValeurChange,
  onBlur,
}: {
  name: "assure_ville" | "chantier_ville";
  label: string;
  valeur: string;
  message?: string;
  onValeurChange: (nom: string) => void;
  onBlur: () => void;
}) => {
  const { chargerOptions, optionCourante, selectionner } = useVilleField(valeur, onValeurChange);

  return (
    <MultiSelectInput
      id={name}
      name={name}
      label={label}
      labelPosition="top"
      required
      cacheOptions
      className="af-form__group ville-field"
      classNamePrefix="ville-field"
      filterOption={null}
      placeholder="Saisissez une commune"
      loadingMessage={() => "Recherche en cours…"}
      noOptionsMessage={messageAucunResultat}
      loadOptions={(saisie) => chargerOptions(saisie)}
      options={optionCourante as OptionVille[]}
      value={optionCourante[0]?.value}
      onChange={({ value }) => selectionner(value)}
      onBlur={onBlur}
      message={message}
      forceDisplayMessage={Boolean(message)}
    />
  );
};

/** Ville du FDR : suggestions geo.api.gouv.fr (nom + code postal), seule la commune est stockée. */
export const VilleField = ({ name, label }: { name: "assure_ville" | "chantier_ville"; label: string }) => {
  const {
    control,
    formState: { errors },
  } = useFormContext<FdrFormValues>();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <ChampVille
          name={name}
          label={label}
          valeur={field.value}
          message={errors[name]?.message}
          onValeurChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    />
  );
};
