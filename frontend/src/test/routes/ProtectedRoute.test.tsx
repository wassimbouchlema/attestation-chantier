import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AuthProvider } from "../../features/auth/AuthProvider";
import { ProtectedRoute } from "../../routes/ProtectedRoute";
import { seedSession } from "../utils";

const renderDepuis = (chemin: string) => {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[chemin]}>
        <Routes>
          <Route path="/login" element={<p>Page de connexion</p>} />
          <Route
            path="/distributeur"
            element={
              <ProtectedRoute roleRequis="DISTRIBUTEUR">
                <p>Espace distributeur</p>
              </ProtectedRoute>
            }
          />
          <Route
            path="/siege"
            element={
              <ProtectedRoute roleRequis="SIEGE">
                <p>Espace siège</p>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
};

describe("ProtectedRoute", () => {
  it("redirige vers /login quand personne n'est connecté", async () => {
    renderDepuis("/distributeur");

    expect(await screen.findByText("Page de connexion")).toBeInTheDocument();
  });

  it("redirige vers l'espace du rôle connecté quand le rôle ne correspond pas à la route", async () => {
    seedSession("SIEGE");
    renderDepuis("/distributeur");

    expect(await screen.findByText("Espace siège")).toBeInTheDocument();
  });

  it("affiche la page protégée, dans le shell authentifié, quand le rôle correspond", async () => {
    seedSession("DISTRIBUTEUR");
    renderDepuis("/distributeur");

    expect(await screen.findByText("Espace distributeur")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Déconnexion" })).toBeInTheDocument();
  });
});
