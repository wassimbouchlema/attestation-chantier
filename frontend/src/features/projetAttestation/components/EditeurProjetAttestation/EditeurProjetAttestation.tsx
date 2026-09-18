import "quill/dist/quill.snow.css";

import type { Utilisateur } from "../../../../api/auth";
import type { DemandeDetail } from "../../../../api/demandes";
import { DocumentGabarit } from "../DocumentGabarit/DocumentGabarit";
import { useQuillEditor } from "../QuillEditor/useQuillEditor";

/**
 * Compose le document : barre d'outils **au-dessus** de la feuille (outil
 * applicatif, absent de l'attestation), puis une feuille A4 unique où le
 * gabarit fixe (en-tête, titres, pied de page) encadre la seule zone
 * éditable. Les titres « PROJET D'ATTESTATION / NON DÉFINITIF » et
 * « ATTESTATION D'ASSURANCE », comme le pied de page de validation, sont
 * rendus ici et non dans `contenu_html` : ils ne sont donc ni supprimables
 * depuis Quill, ni dupliqués par le contenu enregistré.
 */
export const EditeurProjetAttestation = ({
  demande,
  agent,
  valeurInitiale,
  onChange,
}: {
  demande: DemandeDetail;
  agent: Utilisateur;
  valeurInitiale: string;
  onChange: (html: string) => void;
}) => {
  const { conteneurRef, barreOutilsRef } = useQuillEditor(valeurInitiale, onChange);

  return (
    <div className="projet-attestation-editeur">
      <div className="projet-attestation-barre-outils" ref={barreOutilsRef} aria-label="Mise en forme du texte">
        <span className="ql-formats">
          <select className="ql-header" defaultValue="">
            <option value="1">Titre 1</option>
            <option value="2">Titre 2</option>
            <option value="3">Titre 3</option>
            <option value="">Normal</option>
          </select>
        </span>
        <span className="ql-formats">
          <button type="button" className="ql-bold" aria-label="Gras" />
          <button type="button" className="ql-italic" aria-label="Italique" />
          <button type="button" className="ql-underline" aria-label="Souligné" />
        </span>
        <span className="ql-formats">
          <button type="button" className="ql-list" value="ordered" aria-label="Liste numérotée" />
          <button type="button" className="ql-list" value="bullet" aria-label="Liste à puces" />
        </span>
      </div>

      <article className="projet-attestation-feuille">
        <DocumentGabarit demande={demande} agent={agent} />

        <div className="projet-attestation-titres">
          <p className="projet-attestation-titres__projet">Projet d'attestation</p>
          <p className="projet-attestation-titres__mention">Non définitif</p>
          <h2 className="projet-attestation-titres__objet">Attestation d'assurance</h2>
        </div>

        <div className="projet-attestation-corps" ref={conteneurRef} />

        <p className="projet-attestation-pied">Validation définitive : réservée au siège.</p>
      </article>
    </div>
  );
};
