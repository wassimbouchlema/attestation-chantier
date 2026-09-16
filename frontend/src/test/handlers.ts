import { http, HttpResponse } from "msw";

import type { Utilisateur } from "../api/auth";

export const UTILISATEUR_DISTRIBUTEUR: Utilisateur = {
  id: 1,
  username: "distributeur_test",
  first_name: "Jean",
  last_name: "Dupont",
  role: "DISTRIBUTEUR",
};

export const UTILISATEUR_SIEGE: Utilisateur = {
  id: 2,
  username: "siege_test",
  first_name: "Alice",
  last_name: "Martin",
  role: "SIEGE",
};

const UTILISATEURS_PAR_TOKEN: Record<string, Utilisateur> = {
  "access-token-distributeur": UTILISATEUR_DISTRIBUTEUR,
  "access-token-siege": UTILISATEUR_SIEGE,
};

const TOKENS_PAR_UTILISATEUR: Record<string, { access: string; refresh: string }> = {
  distributeur_test: { access: "access-token-distributeur", refresh: "refresh-token-distributeur" },
  siege_test: { access: "access-token-siege", refresh: "refresh-token-siege" },
};

const ACCESS_PAR_REFRESH: Record<string, string> = {
  "refresh-token-distributeur": "access-token-distributeur",
  "refresh-token-siege": "access-token-siege",
};

export const handlers = [
  http.post("*/auth/login/", async ({ request }) => {
    const { username, password } = (await request.json()) as { username: string; password: string };
    const tokens = TOKENS_PAR_UTILISATEUR[username];
    if (!tokens || password !== "test1234") {
      return new HttpResponse(null, { status: 401 });
    }
    return HttpResponse.json(tokens);
  }),

  http.get("*/auth/me/", ({ request }) => {
    const token = (request.headers.get("authorization") ?? "").replace("Bearer ", "");
    const utilisateur = UTILISATEURS_PAR_TOKEN[token];
    if (!utilisateur) {
      return new HttpResponse(null, { status: 401 });
    }
    return HttpResponse.json(utilisateur);
  }),

  http.post("*/auth/refresh/", async ({ request }) => {
    const { refresh } = (await request.json()) as { refresh: string };
    const access = ACCESS_PAR_REFRESH[refresh];
    if (!access) {
      return new HttpResponse(null, { status: 401 });
    }
    return HttpResponse.json({ access });
  }),
];
