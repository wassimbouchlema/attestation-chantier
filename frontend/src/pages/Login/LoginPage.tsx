import { Button, MainContainer, Message, MessageTypes, TextInput, Title } from "@axa-fr/canopee-react/distributeur";
import { Navigate } from "react-router-dom";

import { resolveHomePath } from "../../features/auth/roleHome";
import { AppShell } from "../../layout/AppShell";
import { SessionLoader } from "../../layout/SessionLoader";
import { Surface } from "../../layout/Surface";
import "./LoginPage.css";
import { useLoginPage } from "./useLoginPage";

export const LoginPage = () => {
  const {
    isLoading,
    utilisateur,
    username,
    password,
    erreursChamps,
    erreurGlobale,
    fermerErreurGlobale,
    enCours,
    usernameRef,
    passwordRef,
    handleUsernameChange,
    handlePasswordChange,
    handleSubmit,
  } = useLoginPage();

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
                      onClose={fermerErreurGlobale}
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
