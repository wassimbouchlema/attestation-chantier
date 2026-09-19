import { Navigate, Route, BrowserRouter, Routes, useOutletContext } from "react-router-dom";

import { useAuth } from "../features/auth/useAuth";
import { resolveHomePath } from "../features/auth/roleHome";
import { FdrWizardLayout } from "../features/fdr/components/FdrWizardLayout/FdrWizardLayout";
import type { FdrOutletContext } from "../features/fdr/types/FdrOutletContext";
import { AppShell } from "../layout/AppShell";
import { SessionLoader } from "../layout/SessionLoader";
import { LoginPage } from "../pages/Login/LoginPage";
import { DemandeConsultationPage } from "../pages/DemandeConsultationPage/DemandeConsultationPage";
import { DistributeurHome } from "../pages/DistributeurHome/DistributeurHome";
import { FdrInformationsPage } from "../pages/FdrInformations/FdrInformationsPage";
import { FdrNouvelleDemandePage } from "../pages/FdrNouvelleDemandePage/FdrNouvelleDemandePage";
import { FdrPiecesPage } from "../pages/FdrPieces/FdrPiecesPage";
import { FdrValidationPage } from "../pages/FdrValidationPage/FdrValidationPage";
import { ProjetAttestationPage } from "../pages/ProjetAttestationPage/ProjetAttestationPage";
import { SiegeDemandeConsultationPage } from "../pages/SiegeDemandeConsultationPage/SiegeDemandeConsultationPage";
import { SiegeHome } from "../pages/SiegeHome/SiegeHome";
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

const FdrIndexRedirect = () => {
  const { demande } = useOutletContext<FdrOutletContext>();

  return (
    <Navigate
      to={demande.statut === "BROUILLON" ? "informations" : `/distributeur/demandes/${demande.id}/consultation`}
      replace
    />
  );
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
          path="/distributeur/demandes/nouvelle"
          element={
            <ProtectedRoute roleRequis="DISTRIBUTEUR">
              <FdrNouvelleDemandePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/distributeur/demandes/:id"
          element={
            <ProtectedRoute roleRequis="DISTRIBUTEUR">
              <FdrWizardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<FdrIndexRedirect />} />
          <Route path="informations" element={<FdrInformationsPage />} />
          <Route path="pieces" element={<FdrPiecesPage />} />
          <Route path="validation" element={<FdrValidationPage />} />
        </Route>
        <Route
          path="/distributeur/demandes/:id/consultation"
          element={
            <ProtectedRoute roleRequis="DISTRIBUTEUR">
              <DemandeConsultationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/distributeur/demandes/:id/projet-attestation"
          element={
            <ProtectedRoute roleRequis="DISTRIBUTEUR">
              <ProjetAttestationPage />
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
        <Route
          path="/siege/demandes/:id"
          element={
            <ProtectedRoute roleRequis="SIEGE">
              <SiegeDemandeConsultationPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<RoleHomeRedirect />} />
      </Routes>
    </BrowserRouter>
  );
};
