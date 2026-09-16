import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../features/auth/useAuth";
import { resolveHomePath } from "../features/auth/roleHome";
import type { Role } from "../api/auth";
import { AppShell } from "../layout/AppShell";
import { SessionLoader } from "../layout/SessionLoader";
import { SessionUnavailable } from "../layout/SessionUnavailable";

export const ProtectedRoute = ({ roleRequis, children }: { roleRequis: Role; children: ReactNode }) => {
  const { utilisateur, isLoading, erreurSession, reessayerSession } = useAuth();

  if (isLoading) {
    return (
      <AppShell>
        <SessionLoader />
      </AppShell>
    );
  }

  if (erreurSession && !utilisateur) {
    return (
      <AppShell>
        <SessionUnavailable message={erreurSession} onRetry={reessayerSession} />
      </AppShell>
    );
  }

  if (!utilisateur || utilisateur.role !== roleRequis) {
    return <Navigate to={resolveHomePath(utilisateur)} replace />;
  }

  return <AppShell>{children}</AppShell>;
};
