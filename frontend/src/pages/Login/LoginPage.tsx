import { Button, MainContainer, Message, MessageTypes, TextInput, Title } from "@axa-fr/canopee-react/distributeur";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { ErreurAuthentification, ErreurReseauOuServeur } from "../../api/auth";
import { useAuth } from "../../features/auth/useAuth";
import { resolveHomePath } from "../../features/auth/roleHome";
import { AppShell } from "../../layout/AppShell";
import { SessionLoader } from "../../layout/SessionLoader";
import { Surface } from "../../layout/Surface";
import { useDocumentTitle } from "../../layout/useDocumentTitle";

const MESSAGE_CHAMP_REQUIS = "Ce champ est obligatoire.";
const MESSAGE_ERREUR_GENERIQUE = "Une erreur est survenue. Veuillez réessayer.";

interface ErreursChamps {
  username: string | null;
  password: string | null;
}

/**
 * Seules les erreurs applicatives identifiées (api/auth.ts) sont affichées
 * telles quelles ; toute autre exception (annulation, erreur inattendue)
 * retombe sur un message générique — jamais de détail technique brut.
 */
const messageAffichable = (erreur: unknown): string => {
  if (erreur instanceof ErreurAuthentification || erreur instanceof ErreurReseauOuServeur) {
    return erreur.message;
  }
  return MESSAGE_ERREUR_GENERIQUE;
};

export const LoginPage = () => {
  const { login, isLoading, utilisateur } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [erreursChamps, setErreursChamps] = useState<ErreursChamps>({ username: null, password: null });
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useDocumentTitle("Connexion");

  const handleUsernameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUsername(event.target.value);
    setErreursChamps((precedent) => (precedent.username ? { ...precedent, username: null } : precedent));
  };

  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value);
    setErreursChamps((precedent) => (precedent.password ? { ...precedent, password: null } : precedent));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const prochainesErreurs: ErreursChamps = {
      username: username.trim() ? null : MESSAGE_CHAMP_REQUIS,
      password: password ? null : MESSAGE_CHAMP_REQUIS,
    };
    setErreursChamps(prochainesErreurs);
    if (prochainesErreurs.username) {
      usernameRef.current?.focus();
      return;
    }
    if (prochainesErreurs.password) {
      passwordRef.current?.focus();
      return;
    }

    setErreurGlobale(null);
    setEnCours(true);
    try {
      const utilisateurConnecte = await login(username, password);
      navigate(resolveHomePath(utilisateurConnecte));
    } catch (error) {
      setErreurGlobale(messageAffichable(error));
    } finally {
      setEnCours(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <MainContainer>
          <div className="container app-shell__content">
            <SessionLoader />
          </div>
        </MainContainer>
      </AppShell>
    );
  }

  if (utilisateur) {
    return <Navigate to={resolveHomePath(utilisateur)} replace />;
  }

  return (
    <AppShell>
      <MainContainer>
        <div className="container app-shell__content">
          <div className="row">
            <div className="col-12 col-md-6 offset-md-3 col-lg-4 offset-lg-4">
              <Surface className="login-surface">
                {/* Title (Canopée) n'accepte que h2-h4 — réservé aux titres de
                    section, pas au h1 de page. On garde le rendu visuel de
                    Title en h2 (inchangé) et on ajoute le vrai h1 de la page,
                    masqué visuellement, même technique que sur les accueils. */}
                <h1 className="sr-only">Connexion</h1>
                <Title heading="h2" withDivider={false}>
                  Connexion
                </Title>
                <p className="login-description">
                  Accédez à votre espace de gestion des attestations de chantier.
                </p>

                <form onSubmit={handleSubmit} noValidate className="login-form">
                  {erreurGlobale && (
                    <Message
                      title={erreurGlobale}
                      variant="error"
                      onClose={() => setErreurGlobale(null)}
                      closeButtonAriaLabel="Fermer"
                    />
                  )}

                  <TextInput
                    ref={usernameRef}
                    label="Nom d'utilisateur"
                    labelPosition="top"
                    name="username"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={handleUsernameChange}
                    message={erreursChamps.username ?? undefined}
                    messageType={MessageTypes.error}
                    forceDisplayMessage={Boolean(erreursChamps.username)}
                  />
                  <TextInput
                    ref={passwordRef}
                    label="Mot de passe"
                    labelPosition="top"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={handlePasswordChange}
                    message={erreursChamps.password ?? undefined}
                    messageType={MessageTypes.error}
                    forceDisplayMessage={Boolean(erreursChamps.password)}
                  />
                  <Button type="submit" variant="primary" disabled={enCours} style={{ width: "100%" }}>
                    {enCours ? "Connexion…" : "Se connecter"}
                  </Button>
                  {enCours && (
                    <p role="status" className="sr-only">
                      Connexion en cours…
                    </p>
                  )}
                </form>
              </Surface>
            </div>
          </div>
        </div>
      </MainContainer>
    </AppShell>
  );
};
