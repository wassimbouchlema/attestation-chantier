import { useEffect, useRef } from "react";

import Quill from "quill";

/**
 * Fin wrapper technique autour de Quill (pas un éditeur custom : Quill porte
 * toute la logique d'édition).
 *
 * La barre d'outils est rendue dans un conteneur fourni par l'appelant
 * (`barreOutilsRef`), et non générée par Quill : avec la config par tableau,
 * le thème Snow insère sa barre juste avant la zone d'édition, ce qui la
 * planterait au milieu de la feuille A4. Le conteneur explicite permet de la
 * placer au-dessus du document — c'est un outil de l'application, pas une
 * partie de l'attestation.
 *
 * Quill réécrit le contenu de cette barre (icônes, pickers) : le cleanup
 * restaure donc le HTML initial en plus de vider la zone d'édition, sinon un
 * second montage (StrictMode dev, navigation) empilerait des pickers
 * dupliqués sur une zone d'édition vidée.
 */
export const useQuillEditor = (valeurInitiale: string, onChange: (html: string) => void) => {
  const conteneurRef = useRef<HTMLDivElement>(null);
  const barreOutilsRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const conteneur = conteneurRef.current;
    const barreOutils = barreOutilsRef.current;
    if (!conteneur || !barreOutils) {
      return;
    }
    const htmlBarreInitial = barreOutils.innerHTML;

    const quill = new Quill(conteneur, {
      theme: "snow",
      modules: { toolbar: barreOutils },
    });
    quill.clipboard.dangerouslyPasteHTML(valeurInitiale);
    quill.on("text-change", () => {
      // `getSemanticHTML` sérialise chaque espace en `&nbsp;`. Conservées
      // telles quelles, ces espaces insécables empêcheraient tout retour à la
      // ligne : un paragraphe édité déborderait alors de la feuille A4.
      onChangeRef.current(quill.getSemanticHTML().replaceAll("&nbsp;", " "));
    });

    return () => {
      barreOutils.innerHTML = htmlBarreInitial;
      barreOutils.classList.remove("ql-toolbar", "ql-snow");
      conteneur.innerHTML = "";
    };
  }, [valeurInitiale]);

  return { conteneurRef, barreOutilsRef };
};
