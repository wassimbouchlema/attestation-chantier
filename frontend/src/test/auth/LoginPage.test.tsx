import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthProvider } from "../../features/auth/AuthProvider";
import { LoginPage } from "../../pages/Login/LoginPage";
import { server } from "../server";

const renderLoginPage = () => {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/distributeur" element={<p>Espace distributeur</p>} />
          <Route path="/siege" element={<p>Espace siège</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
};

describe("LoginPage", () => {
  let appelsLogin: number;

  beforeEach(() => {
    appelsLogin = 0;
    server.events.on("request:start", ({ request }) => {
      if (request.url.includes("/auth/login/")) {
        appelsLogin += 1;
      }
    });
  });

  // server.resetHandlers() (setup.ts) ne désinscrit pas les listeners de
  // server.events : sans ce retrait, chaque test ajoute un nouveau listener
  // qui reste actif pour tous les suivants, faussant progressivement le
  // compteur appelsLogin des tests ultérieurs de ce fichier.
  afterEach(() => {
    server.events.removeAllListeners("request:start");
  });

  it("affiche une erreur par champ et n'appelle pas l'API quand les champs sont vides", async () => {
    const user = userEvent.setup();
    const { container } = renderLoginPage();

    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findAllByText("Ce champ est obligatoire.")).toHaveLength(2);
    expect(appelsLogin).toBe(0);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("place le focus sur le premier champ invalide après une soumission vide", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findAllByText("Ce champ est obligatoire.")).toHaveLength(2);
    expect(screen.getByLabelText("Nom d'utilisateur")).toHaveFocus();
  });

  it("place le focus sur le mot de passe s'il est seul manquant", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Nom d'utilisateur"), "distributeur_test");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByText("Ce champ est obligatoire.")).toBeInTheDocument();
    expect(screen.getByLabelText("Mot de passe")).toHaveFocus();
  });

  it("ne présente pas de violation d'accessibilité détectable (axe) à l'affichage initial", async () => {
    const { container } = renderLoginPage();

    await screen.findByRole("heading", { name: "Connexion", level: 1 });

    expect(await axe(container)).toHaveNoViolations();
  });

  it("affiche un message dédié quand les identifiants sont incorrects", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Nom d'utilisateur"), "distributeur_test");
    await user.type(screen.getByLabelText("Mot de passe"), "mauvais-mot-de-passe");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByText("Identifiant ou mot de passe incorrect.")).toBeInTheDocument();
  });

  it("affiche un message générique quand le serveur répond en erreur (500)", async () => {
    server.use(http.post("*/auth/login/", () => HttpResponse.json(null, { status: 500 })));
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Nom d'utilisateur"), "distributeur_test");
    await user.type(screen.getByLabelText("Mot de passe"), "test1234");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByText("Une erreur est survenue. Veuillez réessayer.")).toBeInTheDocument();
  });

  it("affiche un message générique lors d'une vraie erreur réseau (fetch rejeté)", async () => {
    server.use(http.post("*/auth/login/", () => HttpResponse.error()));
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Nom d'utilisateur"), "distributeur_test");
    await user.type(screen.getByLabelText("Mot de passe"), "test1234");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByText("Une erreur est survenue. Veuillez réessayer.")).toBeInTheDocument();
  });

  it("n'affiche pas de session persistée quand le login réussit mais /me/ échoue", async () => {
    server.use(http.get("*/auth/me/", () => new HttpResponse(null, { status: 500 })));
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Nom d'utilisateur"), "distributeur_test");
    await user.type(screen.getByLabelText("Mot de passe"), "test1234");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByText("Impossible de récupérer le profil utilisateur.")).toBeInTheDocument();
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
  });

  it("redirige vers /distributeur après une connexion DISTRIBUTEUR réussie", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Nom d'utilisateur"), "distributeur_test");
    await user.type(screen.getByLabelText("Mot de passe"), "test1234");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByText("Espace distributeur")).toBeInTheDocument();
  });

  it("redirige vers /siege après une connexion SIEGE réussie", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Nom d'utilisateur"), "siege_test");
    await user.type(screen.getByLabelText("Mot de passe"), "test1234");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByText("Espace siège")).toBeInTheDocument();
  });
});
