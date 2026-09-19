import { resolveHomePath } from "../features/auth/roleHome";
import { useAuth } from "../features/auth/useAuth";

export const usePageHeader = () => {
  const { utilisateur } = useAuth();
  return { accueil: resolveHomePath(utilisateur) };
};
