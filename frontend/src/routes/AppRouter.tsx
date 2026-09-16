import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";

import { useAuth } from "../features/auth/useAuth";
import { LoginPage } from "../features/auth/LoginPage";
import { resolveHomePath } from "../features/auth/roleHome";
import { AppShell } from "../layout/AppShell";
import { SessionLoader } from "../layout/SessionLoader";
import { DistributeurHome } from "../pages/DistributeurHome";
import { SiegeHome } from "../pages/SiegeHome";
import { ProtectedRoute } from "./ProtectedRoute";

/**
 * Point d'entrée "/" et toute route inconnue : redirige vers l'espace du
 * rôle connecté (ou /login si personne n'est connecté), via la même
 * résolution que le clic sur le logo et la redirection post-login.
 */
const RoleHomeRedirect = () => {
  const { utilisateur, isLoading } = useAuth();

  if (isLoading) {
    return (
      <AppShell>
        <SessionLoader />
      </AppShell>
    );
  }

  return <Navigate to={resolveHomePath(utilisateur)} replace />;
};

export const AppRouter = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RoleHomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/distributeur"
          element={
            <ProtectedRoute roleRequis="DISTRIBUTEUR">
              <DistributeurHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/siege"
          element={
            <ProtectedRoute roleRequis="SIEGE">
              <SiegeHome />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<RoleHomeRedirect />} />
      </Routes>
    </BrowserRouter>
  );
};
