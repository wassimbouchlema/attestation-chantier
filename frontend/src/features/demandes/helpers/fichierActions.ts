/**
 * Même logique que `pdfActions.ts`, sans son nom trompeur (les pièces ne
 * sont pas toujours des PDF). L'URL de prévisualisation n'est pas révoquée
 * tout de suite : le nouvel onglet doit avoir le temps de charger la ressource.
 */
export const previsualiserFichier = (blob: Blob): void => {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
};

export const telechargerFichier = (blob: Blob, nomFichier: string): void => {
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  URL.revokeObjectURL(url);
};
