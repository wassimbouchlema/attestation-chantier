import { Button } from "@axa-fr/canopee-react/distributeur";

/**
 * Une indisponibilité réseau/serveur pendant la vérification de session n'est
 * pas une session invalide (voir api/auth.ts : ErreurReseauOuServeur) — on ne
 * déconnecte pas de force, on propose de réessayer plutôt que de rediriger
 * silencieusement vers /login comme si l'utilisateur n'était pas connecté.
 */
export const SessionUnavailable = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="container app-shell__content" role="alert">
    <p>{message}</p>
    <Button variant="primary" onClick={onRetry}>
      Réessayer
    </Button>
  </div>
);
