import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "../../features/auth/authContext";
import { AuthProvider } from "../../features/auth/AuthProvider";
import { useAuth } from "../../features/auth/useAuth";
import { server } from "../server";
import { seedSession } from "../utils";

const ConsommateurTest = () => {
  const { utilisateur, isLoading, erreurSession, reessayerSession, login } = useAuth();

  if (isLoading) {
    return <p>Chargement…</p>;
  }

  if (erreurSession) {
    return (
      <div>
        <p>{erreurSession}</p>
        <button onClick={() => reessayerSession()}>Réessayer</button>
      </div>
    );
  }

  if (!utilisateur) {
    return (
      <div>
        <p>Non connecté</p>
        <button onClick={() => login("siege_test", "test1234")}>Se connecter (SIÈGE)</button>
      </div>
    );
  }

  return (
    <p>
      Connecté : {utilisateur.username} ({utilisateur.role})
    </p>
  );
};

/**
 * Variante utilisée uniquement pour le test de course de session ci-dessous :
 * le bouton de login reste disponible même pendant isLoading, pour pouvoir
 * déclencher un login alors qu'une restauration est encore en vol. Dans
 * l'application réelle, LoginPage bloque déjà ce cas au niveau UI (elle
 * affiche un SessionLoader tant que isLoading est vrai) — ce test vérifie
 * que la garantie existe aussi au niveau du provider lui-même, indépendamment
 * de cette protection UI.
 */
const ConsommateurAvecLoginToujoursDisponible = () => {
  const { utilisateur, isLoading, login } = useAuth();

  return (
    <div>
      <p>
        {isLoading
          ? "Chargement…"
          : utilisateur
            ? `Connecté : ${utilisateur.username} (${utilisateur.role})`
            : "Non connecté"}
      </p>
      <button onClick={() => login("siege_test", "test1234")}>Se connecter (SIÈGE)</button>
    </div>
  );
};

describe("AuthProvider — restauration de session au montage", () => {
  it("restaure la session quand un access token valide est déjà stocké", async () => {
    seedSession("DISTRIBUTEUR");

    render(
      <AuthProvider>
        <ConsommateurTest />
      </AuthProvider>,
    );

    expect(await screen.findByText("Connecté : distributeur_test (DISTRIBUTEUR)")).toBeInTheDocument();
  });

  it("retente via le refresh token quand l'access token est expiré, puis restaure la session", async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, "access-token-expire");
    localStorage.setItem(REFRESH_TOKEN_KEY, "refresh-token-siege");

    render(
      <AuthProvider>
        <ConsommateurTest />
      </AuthProvider>,
    );

    expect(await screen.findByText("Connecté : siege_test (SIEGE)")).toBeInTheDocument();
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe("access-token-siege");
  });

  it("déconnecte et vide le storage quand l'access token et le refresh token sont tous deux invalides", async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, "access-token-expire");
    localStorage.setItem(REFRESH_TOKEN_KEY, "refresh-token-invalide");

    render(
      <AuthProvider>
        <ConsommateurTest />
      </AuthProvider>,
    );

    expect(await screen.findByText("Non connecté")).toBeInTheDocument();
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
  });

  it("reste non connecté quand aucun token n'est stocké", async () => {
    render(
      <AuthProvider>
        <ConsommateurTest />
      </AuthProvider>,
    );

    expect(await screen.findByText("Non connecté")).toBeInTheDocument();
  });

  it("signale une indisponibilité (sans déconnecter) quand /me/ échoue pour une raison serveur", async () => {
    seedSession("DISTRIBUTEUR");
    server.use(http.get("*/auth/me/", () => new HttpResponse(null, { status: 500 })));

    render(
      <AuthProvider>
        <ConsommateurTest />
      </AuthProvider>,
    );

    expect(
      await screen.findByText("Impossible de vérifier votre session. Vérifiez votre connexion puis réessayez."),
    ).toBeInTheDocument();
    // Les tokens restent en place : ce n'est pas une session invalide, juste indisponible.
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe("access-token-distributeur");
  });

  it("permet de réessayer après une indisponibilité, et restaure la session si le serveur répond de nouveau", async () => {
    const user = userEvent.setup();
    seedSession("DISTRIBUTEUR");
    server.use(http.get("*/auth/me/", () => new HttpResponse(null, { status: 500 })));

    render(
      <AuthProvider>
        <ConsommateurTest />
      </AuthProvider>,
    );
    await screen.findByText(/Impossible de vérifier votre session/);

    server.resetHandlers();
    await user.click(screen.getByRole("button", { name: "Réessayer" }));

    expect(await screen.findByText("Connecté : distributeur_test (DISTRIBUTEUR)")).toBeInTheDocument();
  });

  it("une connexion déclenchée pendant une restauration encore en vol l'emporte sur celle-ci", async () => {
    const user = userEvent.setup();
    seedSession("DISTRIBUTEUR");

    let libererRestaurationDistributeur: () => void = () => {};
    const restaurationDifferee = new Promise<void>((resolve) => {
      libererRestaurationDistributeur = resolve;
    });

    server.use(
      http.get("*/auth/me/", async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace("Bearer ", "");
        if (token === "access-token-distributeur") {
          await restaurationDifferee;
        }
        return HttpResponse.json(
          token === "access-token-siege"
            ? { id: 2, username: "siege_test", first_name: "Alice", last_name: "Martin", role: "SIEGE" }
            : { id: 1, username: "distributeur_test", first_name: "Jean", last_name: "Dupont", role: "DISTRIBUTEUR" },
        );
      }),
    );

    render(
      <AuthProvider>
        <ConsommateurAvecLoginToujoursDisponible />
      </AuthProvider>,
    );
    await screen.findByText("Chargement…");

    // Une connexion démarre alors que la restauration ci-dessus est encore
    // bloquée sur restaurationDifferee (elle abandonne cette restauration).
    await user.click(screen.getByRole("button", { name: "Se connecter (SIÈGE)" }));
    expect(await screen.findByText("Connecté : siege_test (SIEGE)")).toBeInTheDocument();

    // La réponse tardive de la restauration abandonnée arrive maintenant :
    // elle ne doit pas écraser la session SIÈGE fraîchement établie.
    libererRestaurationDistributeur();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByText("Connecté : siege_test (SIEGE)")).toBeInTheDocument();
  });
});
