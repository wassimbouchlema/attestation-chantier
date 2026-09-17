import { useState, type ComponentProps } from "react";

import type { FileInput } from "@axa-fr/canopee-react/distributeur";

import type { CategoriePiece } from "../../../../api/pieces";
import { messageErreurAffichable } from "../../../demandes/helpers/messageErreur";
import { useUploaderPiece } from "../../queries";

/**
 * `CustomFile`/`FileRejection` ne sont pas exportés publiquement par
 * `@axa-fr/canopee-react/distributeur` (seul `FilePreview` l'est) — dérivés
 * ici directement des props réellement exportées de `FileInput`, plutôt que
 * de les redéclarer à la main ou d'importer `react-dropzone` (dépendance
 * transitive de Canopée, non déclarée dans notre package.json).
 */
type FileInputProps = ComponentProps<typeof FileInput>;
type ValeurFichier = NonNullable<FileInputProps["values"]>[number];
type ErreurFichier = NonNullable<FileInputProps["errors"]>[number];
type ChangementFileInput = Parameters<NonNullable<FileInputProps["onChange"]>>[0];

/**
 * Orchestration de l'upload d'une pièce, y compris le contournement du bug
 * Canopée `FileInput` : le composant ne connaît que `handleChange`, jamais
 * pourquoi `values[0].file` n'est pas un vrai fichier ni comment récupérer le
 * vrai `File`.
 */
export const usePieceUploadField = (demandeId: string, categorie: CategoriePiece) => {
  const [valeurs, setValeurs] = useState<ValeurFichier[]>([]);
  const [erreursNavigateur, setErreursNavigateur] = useState<ErreurFichier[]>([]);
  const uploaderPieceMutation = useUploaderPiece(demandeId);
  const idChampFichier = `piece-input-${categorie}`;

  const handleChange = ({ values, errors, fileAction }: ChangementFileInput) => {
    // FileInput ne désactive pas lui-même le bouton "Supprimer" de son
    // FileTable interne via `disabled` (vérifié dans le code source de
    // FileInput.js : `disabled` n'est jamais transmis à FileTable). On
    // ignore donc explicitement un retrait pendant un envoi en cours,
    // plutôt que d'annuler une requête déjà partie (hors périmètre).
    if (fileAction === "delete") {
      if (!uploaderPieceMutation.isPending) {
        setValeurs([]);
      }
      return;
    }

    // `File.onChange` renvoie des erreurs enveloppées (`{id, file}`), mais la
    // prop `errors` de FileInput/FileTable attend directement des
    // `FileRejection[]` (types différents malgré le nom commun) —
    // dépaquetage nécessaire avant de les redonner à FileInput.
    setErreursNavigateur((errors ?? []).map((erreur) => erreur.file));
    if (values.length === 0) {
      return;
    }
    setValeurs(values);

    // `values[0].file` n'est pas un vrai `File`/`Blob` (Canopée le
    // reconstruit via spread, sans données binaires) — FormData le
    // sérialiserait en "[object Object]". Le vrai fichier reste
    // accessible sur l'`<input type="file">` caché sous-jacent.
    const fichierReel = (document.getElementById(idChampFichier) as HTMLInputElement | null)?.files?.[0];
    if (!fichierReel) {
      return;
    }
    uploaderPieceMutation.mutate(
      { typePiece: categorie, fichier: fichierReel },
      { onSettled: () => setValeurs([]) },
    );
  };

  return {
    idChampFichier,
    valeurs,
    erreursNavigateur,
    handleChange,
    televersementEnCours: uploaderPieceMutation.isPending,
    erreurTeleversement: uploaderPieceMutation.isError ? messageErreurAffichable(uploaderPieceMutation.error) : null,
    fermerErreurTeleversement: () => uploaderPieceMutation.reset(),
  };
};
