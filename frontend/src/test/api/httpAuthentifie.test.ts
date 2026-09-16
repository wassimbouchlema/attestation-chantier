import { HttpResponse, delay, http } from "msw";
import { describe, expect, it } from "vitest";

import { ErreurAuthentification } from "../../api/http";
import { requeteAuthentifiee } from "../../api/httpAuthentifie";
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "../../features/auth/authContext";
import { server } from "../server";

const seedTokens = (access: string, refresh: string) => {
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
};

describe("httpAuthentifie.requeteAuthentifiee — 401 -> refresh -> retry", () => {
  it("rejoue la requête avec le nouveau token après un refresh réussi", async () => {
    seedTokens("access-expire", "refresh-valide");
    let appelsDemandes = 0;
    server.use(
      http.get("*/demandes/", ({ request }) => {
        appelsDemandes += 1;
        if (request.headers.get("authorization") === "Bearer access-expire") {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json({ count: 0, next: null, previous: null, results: [] });
      }),
      http.post("*/auth/refresh/", () => HttpResponse.json({ access: "access-frais" })),
    );

    const response = await requeteAuthentifiee("/demandes/");

    expect(response.status).toBe(200);
    expect(appelsDemandes).toBe(2);
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe("access-frais");
  });

  it("deux 401 concurrents (deux requêtes différentes) ne déclenchent qu'un seul refresh", async () => {
    seedTokens("access-expire", "refresh-valide");
    let appelsRefresh = 0;
    server.use(
      http.get("*/demandes/", ({ request }) =>
        request.headers.get("authorization") === "Bearer access-expire"
          ? new HttpResponse(null, { status: 401 })
          : HttpResponse.json({ ok: true }),
      ),
      http.get("*/demandes/autre/", ({ request }) =>
        request.headers.get("authorization") === "Bearer access-expire"
          ? new HttpResponse(null, { status: 401 })
          : HttpResponse.json({ ok: true }),
      ),
      http.post("*/auth/refresh/", async () => {
        appelsRefresh += 1;
        await delay(30);
        return HttpResponse.json({ access: "access-frais" });
      }),
    );

    const [a, b] = await Promise.all([requeteAuthentifiee("/demandes/"), requeteAuthentifiee("/demandes/autre/")]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(appelsRefresh).toBe(1);
  });

  it("si le retry retourne encore 401, aucun deuxième refresh n'est tenté", async () => {
    seedTokens("access-expire", "refresh-valide");
    let appelsRefresh = 0;
    server.use(
      http.get("*/demandes/", () => new HttpResponse(null, { status: 401 })),
      http.post("*/auth/refresh/", () => {
        appelsRefresh += 1;
        return HttpResponse.json({ access: "access-toujours-refuse" });
      }),
    );

    await expect(requeteAuthentifiee("/demandes/")).rejects.toThrow(ErreurAuthentification);
    expect(appelsRefresh).toBe(1);
  });

  it("un refresh token invalide efface les tokens", async () => {
    seedTokens("access-expire", "refresh-invalide");
    server.use(
      http.get("*/demandes/", () => new HttpResponse(null, { status: 401 })),
      http.post("*/auth/refresh/", () => new HttpResponse(null, { status: 401 })),
    );

    await expect(requeteAuthentifiee("/demandes/")).rejects.toThrow(ErreurAuthentification);
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
  });

  it.each([400, 403, 404])("un %i ne déclenche aucun refresh", async (status) => {
    seedTokens("access-valide", "refresh-valide");
    let appelsRefresh = 0;
    server.use(
      http.get("*/demandes/", () => new HttpResponse(null, { status })),
      http.post("*/auth/refresh/", () => {
        appelsRefresh += 1;
        return HttpResponse.json({ access: "x" });
      }),
    );

    const response = await requeteAuthentifiee("/demandes/");

    expect(response.status).toBe(status);
    expect(appelsRefresh).toBe(0);
  });
});
