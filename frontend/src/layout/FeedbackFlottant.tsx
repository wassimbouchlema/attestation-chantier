import { Message } from "@axa-fr/canopee-react/distributeur";

import "./FeedbackFlottant.css";

// Canopée 1.8.0 n'expose pas de toast : le Message `success` est posé hors flux
// dans une région `status` toujours présente, pour que l'annonce soit vocalisée.
export const FeedbackFlottant = ({ message, onClose }: { message: string | null; onClose: () => void }) => (
  <div className="feedback-flottant" role="status">
    {message && <Message variant="success" title={message} onClose={onClose} closeButtonAriaLabel="Fermer" />}
  </div>
);
