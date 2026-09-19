import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listerNotifications, marquerNotificationsVues, type NotificationsResponseApi } from "../../api/notifications";

export const notificationsKeys = {
  all: ["notifications"] as const,
  liste: () => [...notificationsKeys.all, "liste"] as const,
};

/** `refetchOnWindowFocus` explicite : le badge doit rester à jour au retour sur l'onglet. */
export const useNotifications = () => {
  return useQuery({
    queryKey: notificationsKeys.liste(),
    queryFn: ({ signal }) => listerNotifications(signal),
    refetchOnWindowFocus: true,
  });
};

/**
 * Optimiste (`onMutate`) : `non_vues` doit décroître dès l'appel, sans
 * attendre l'aller-retour réseau — `onSettled` réconcilie ensuite avec le
 * serveur, `onError` restaure l'état précédent en cas d'échec du POST.
 */
export const useMarquerNotificationsVues = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => marquerNotificationsVues(ids),
    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey: notificationsKeys.liste() });
      const precedent = queryClient.getQueryData<NotificationsResponseApi>(notificationsKeys.liste());
      if (precedent) {
        const idsAMarquer = new Set(ids);
        const maintenant = new Date().toISOString();
        queryClient.setQueryData<NotificationsResponseApi>(notificationsKeys.liste(), {
          non_vues: precedent.notifications.filter((n) => n.seen_at === null && !idsAMarquer.has(n.id)).length,
          notifications: precedent.notifications.map((n) =>
            idsAMarquer.has(n.id) && n.seen_at === null ? { ...n, seen_at: maintenant } : n,
          ),
        });
      }
      return { precedent };
    },
    onError: (_erreur, _ids, contexte) => {
      if (contexte?.precedent) {
        queryClient.setQueryData(notificationsKeys.liste(), contexte.precedent);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationsKeys.liste() });
    },
  });
};
