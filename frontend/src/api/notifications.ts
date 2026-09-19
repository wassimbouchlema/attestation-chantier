import { ErreurReseauOuServeur, lireJson } from "./http";
import { requeteAuthentifiee } from "./httpAuthentifie";

export type TypeNotification = "DEMANDE_ENVOYEE" | "RELANCE";

/** Reflète `NotificationSerializer` (backend/demandes/serializers.py). */
export interface NotificationApi {
  id: string;
  type_notification: TypeNotification;
  titre: string;
  message: string;
  demande_id: string;
  created_at: string;
  // null = badge "non vue" ; renseigné = déjà présentée. Jamais "lue"/supprimée.
  seen_at: string | null;
}

export interface NotificationsResponseApi {
  non_vues: number;
  notifications: NotificationApi[];
}

export const listerNotifications = async (signal?: AbortSignal): Promise<NotificationsResponseApi> => {
  const messageIndisponible = "Impossible de récupérer les notifications.";
  const response = await requeteAuthentifiee("/notifications/", { signal });
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<NotificationsResponseApi>(response, messageIndisponible);
};

/**
 * `POST /notifications/marquer-vues/` — appel batch (jamais une requête par
 * notification) : seules les notifications effectivement affichées et encore
 * `seen_at=null` au moment de l'ouverture du panneau doivent être transmises.
 */
export const marquerNotificationsVues = async (ids: string[]): Promise<{ marquees: number }> => {
  const messageIndisponible = "Impossible de marquer les notifications comme vues.";
  const response = await requeteAuthentifiee("/notifications/marquer-vues/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) {
    throw new ErreurReseauOuServeur(messageIndisponible);
  }
  return lireJson<{ marquees: number }>(response, messageIndisponible);
};
