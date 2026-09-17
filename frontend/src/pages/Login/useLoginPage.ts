import { useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { useNavigate } from "react-router-dom";

import { ErreurAuthentification, ErreurReseauOuServeur } from "../../api/auth";
import { resolveHomePath } from "../../features/auth/roleHome";
import { useAuth } from "../../features/auth/useAuth";
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

/** Orchestration de l'écran de connexion : saisie, validation locale, focus, soumission. */
export const useLoginPage = () => {
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

  return {
    isLoading,
    utilisateur,
    username,
    password,
    erreursChamps,
    erreurGlobale,
    fermerErreurGlobale: () => setErreurGlobale(null),
    enCours,
    usernameRef,
    passwordRef,
    handleUsernameChange,
    handlePasswordChange,
    handleSubmit,
  };
};
