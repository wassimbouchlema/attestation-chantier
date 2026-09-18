import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@axa-fr/canopee-react/distributeur";
import { useEffect, useRef } from "react";

export const SupprimerBrouillonModal = ({
  ouvert,
  onConfirmer,
  onAnnuler,
  suppressionEnCours,
}: {
  ouvert: boolean;
  onConfirmer: () => void;
  onAnnuler: () => void;
  suppressionEnCours: boolean;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!ouvert || !dialog) {
      return;
    }
    dialog.showModal();
    const gererFermetureNative = () => onAnnuler();
    dialog.addEventListener("cancel", gererFermetureNative);
    return () => dialog.removeEventListener("cancel", gererFermetureNative);
  }, [ouvert, onAnnuler]);

  if (!ouvert) {
    return null;
  }

  return (
    <Modal ref={dialogRef} title="Supprimer ce brouillon ?" onOutsideTap={onAnnuler}>
      <ModalHeader title="Supprimer ce brouillon ?" onCancel={onAnnuler} closeButtonAriaLabel="Fermer" />
      <ModalBody>
        <p>Cette action supprimera définitivement la demande et les pièces justificatives déjà ajoutées.</p>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onAnnuler} disabled={suppressionEnCours}>
          Annuler
        </Button>
        <Button variant="danger" onClick={onConfirmer} disabled={suppressionEnCours}>
          {suppressionEnCours ? "Suppression…" : "Supprimer"}
        </Button>
      </ModalFooter>
    </Modal>
  );
};
