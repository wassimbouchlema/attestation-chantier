import { useEffect, useRef } from "react";

import Quill from "quill";

// Le conteneur explicite garde la toolbar hors de la feuille ; son HTML est
// restauré au cleanup pour éviter les pickers dupliqués sous StrictMode.
export const useQuillEditor = (valeurInitiale: string, onChange: (html: string) => void, disabled = false) => {
  const quillRef = useRef<Quill | null>(null);
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
    quillRef.current = quill;
    quill.clipboard.dangerouslyPasteHTML(valeurInitiale);
    quill.on("text-change", () => {
      // `getSemanticHTML` sérialise chaque espace en `&nbsp;`. Conservées
      // telles quelles, ces espaces insécables empêcheraient tout retour à la
      // ligne : un paragraphe édité déborderait alors de la feuille A4.
      onChangeRef.current(quill.getSemanticHTML().replaceAll("&nbsp;", " "));
    });

    return () => {
      quillRef.current = null;
      barreOutils.innerHTML = htmlBarreInitial;
      barreOutils.classList.remove("ql-toolbar", "ql-snow");
      conteneur.innerHTML = "";
    };
  }, [valeurInitiale]);

  useEffect(() => {
    quillRef.current?.enable(!disabled);
  }, [disabled, valeurInitiale]);

  return { conteneurRef, barreOutilsRef };
};
