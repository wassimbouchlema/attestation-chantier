import { useEffect, useState } from "react";

const DUREE_PAR_DEFAUT_MS = 6000;

export const useMessageTemporaire = (dureeMs = DUREE_PAR_DEFAUT_MS) => {
  // `cle` relance le minuteur quand le même texte est affiché deux fois de suite.
  const [etat, setEtat] = useState<{ texte: string; cle: number } | null>(null);

  useEffect(() => {
    if (!etat) return;
    const minuteur = setTimeout(() => setEtat(null), dureeMs);
    return () => clearTimeout(minuteur);
  }, [etat, dureeMs]);

  return {
    message: etat?.texte ?? null,
    afficher: (texte: string) => setEtat((precedent) => ({ texte, cle: (precedent?.cle ?? 0) + 1 })),
    fermer: () => setEtat(null),
  };
};
