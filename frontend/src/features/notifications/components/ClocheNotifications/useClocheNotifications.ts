import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Role } from "../../../../api/auth";
import type { NotificationApi } from "../../../../api/notifications";
import { useMarquerNotificationsVues, useNotifications } from "../../queries";

const TAILLE_PAGE = 6;

/**
 * Marque vues, en un seul appel batch, les notifications affichées encore
 * `seen_at=null` — jamais au GET (refetch en arrière-plan possible). Elles
 * restent visibles après avoir été vues.
 */
export const useClocheNotifications = (role: Role) => {
  const [ouvert, setOuvert] = useState(false);
  const [nombreAffiche, setNombreAffiche] = useState(TAILLE_PAGE);
  // `position: fixed`, calculée depuis le rect réel de la cloche (Header non
  // sticky, position variable selon la route) plutôt qu'un CSS `right: 0`
  // relatif à la cloche : sinon le panneau peut déborder le viewport.
  const [positionPanneau, setPositionPanneau] = useState<{ top: number; right: number } | null>(null);
  // Snapshot des ids "Nouveau" au moment de l'ouverture : reste affiché tant
  // que le panneau est ouvert, même une fois seen_at renseigné côté serveur.
  const [idsNouveauPendantOuverture, setIdsNouveauPendantOuverture] = useState<Set<string>>(new Set());

  const navigate = useNavigate();
  const notificationsQuery = useNotifications();
  const marquerVuesMutation = useMarquerNotificationsVues();

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panneauRef = useRef<HTMLDivElement>(null);

  const toutes = notificationsQuery.data?.notifications ?? [];
  const nonVues = notificationsQuery.data?.non_vues ?? 0;
  const notifications = toutes.slice(0, nombreAffiche);
  const dAutresRestent = toutes.length > nombreAffiche;

  const marquerVuesSiNecessaire = (liste: NotificationApi[]) => {
    const idsNonVus = liste.filter((n) => n.seen_at === null).map((n) => n.id);
    if (idsNonVus.length > 0) {
      setIdsNouveauPendantOuverture((precedent) => new Set([...precedent, ...idsNonVus]));
      marquerVuesMutation.mutate(idsNonVus);
    }
  };

  const calculerPosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    setPositionPanneau({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
  };

  const ouvrir = () => {
    calculerPosition();
    setOuvert(true);
    setNombreAffiche(TAILLE_PAGE);
    marquerVuesSiNecessaire(toutes.slice(0, TAILLE_PAGE));
  };

  const fermer = () => {
    setOuvert(false);
    setIdsNouveauPendantOuverture(new Set());
  };

  const fermerEtRendreLeFocus = () => {
    fermer();
    triggerRef.current?.focus();
  };

  const basculer = () => (ouvert ? fermerEtRendreLeFocus() : ouvrir());

  const afficherPlus = () => {
    const suivant = nombreAffiche + TAILLE_PAGE;
    marquerVuesSiNecessaire(toutes.slice(nombreAffiche, suivant));
    setNombreAffiche(suivant);
  };

  const ouvrirDemande = (demandeId: string) => {
    fermer();
    navigate(`/${role.toLowerCase()}/demandes/${demandeId}`);
  };

  useEffect(() => {
    if (!ouvert) {
      return;
    }

    const surClavier = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        fermerEtRendreLeFocus();
      }
    };
    const surClicExterieur = (event: MouseEvent) => {
      const cible = event.target as Node;
      if (!panneauRef.current?.contains(cible) && !triggerRef.current?.contains(cible)) {
        fermer();
      }
    };
    // Recalcule au scroll de la page (jamais ne ferme) ; ignore le scroll interne du panneau.
    const surScroll = (event: Event) => {
      if (panneauRef.current?.contains(event.target as Node)) {
        return;
      }
      calculerPosition();
    };

    document.addEventListener("keydown", surClavier);
    document.addEventListener("mousedown", surClicExterieur);
    window.addEventListener("resize", calculerPosition);
    window.addEventListener("scroll", surScroll, true);
    return () => {
      document.removeEventListener("keydown", surClavier);
      document.removeEventListener("mousedown", surClicExterieur);
      window.removeEventListener("resize", calculerPosition);
      window.removeEventListener("scroll", surScroll, true);
    };
  }, [ouvert]);

  return {
    ouvert,
    basculer,
    triggerRef,
    panneauRef,
    positionPanneau,
    notifications,
    dAutresRestent,
    afficherPlus,
    nonVues,
    idsNouveauPendantOuverture,
    ouvrirDemande,
  };
};
