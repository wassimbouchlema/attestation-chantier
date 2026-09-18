export const ouvrirPdfDansUnNouvelOnglet = (blob: Blob): void => {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
};

export const telechargerPdf = (blob: Blob, nomFichier: string): void => {
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  URL.revokeObjectURL(url);
};
