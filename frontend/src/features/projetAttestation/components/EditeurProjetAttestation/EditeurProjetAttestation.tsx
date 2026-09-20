import "quill/dist/quill.snow.css";
import "./EditeurProjetAttestation.css";

import type { Utilisateur } from "../../../../api/auth";
import type { DemandeDetail } from "../../../../api/demandes";
import { DocumentGabarit } from "../DocumentGabarit/DocumentGabarit";
import { useQuillEditor } from "../QuillEditor/useQuillEditor";

// Le gabarit reste hors du HTML éditable pour éviter sa modification ou sa duplication.
export const EditeurProjetAttestation = ({
  demande,
  agent,
  valeurInitiale,
  onChange,
  preparation = false,
  disabled = false,
}: {
  demande: DemandeDetail;
  agent?: Utilisateur;
  valeurInitiale: string;
  onChange: (html: string) => void;
  preparation?: boolean;
  disabled?: boolean;
}) => {
  const { conteneurRef, barreOutilsRef } = useQuillEditor(valeurInitiale, onChange, disabled);

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
          <h2 className="projet-attestation-titres__objet">Attestation d'assurance</h2>
          {!preparation && <p className="projet-attestation-titres__mention">Non définitif</p>}
        </div>

        <div className="projet-attestation-corps" ref={conteneurRef} />

        {!preparation && <p className="projet-attestation-pied">Validation définitive : réservée au siège.</p>}
      </article>
    </div>
  );
};
