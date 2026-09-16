import { HttpResponse, delay, http } from "msw";
import { describe, expect, it } from "vitest";

import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "../../features/auth/authContext";
import { getAccessToken, rafraichirAccessToken, registerLogoutHandler } from "../../features/auth/tokenStore";
import { server } from "../server";

const seedTokens = (access: string, refresh: string) => {
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
};

describe("tokenStore.rafraichirAccessToken", () => {
  it("rafraîchit l'access token et le persiste en localStorage", async () => {
    seedTokens("ancien-access", "refresh-valide");
    server.use(http.post("*/auth/refresh/", () => HttpResponse.json({ access: "nouvel-access" })));

    const token = await rafraichirAccessToken();

    expect(token).toBe("nouvel-access");
    expect(getAccessToken()).toBe("nouvel-access");
  });

  it("déduplique deux appels concurrents : un seul appel réseau au serveur", async () => {
    seedTokens("ancien-access", "refresh-valide");
    let appels = 0;
    server.use(
      http.post("*/auth/refresh/", async () => {
        appels += 1;
        await delay(50);
        return HttpResponse.json({ access: "nouvel-access" });
      }),
    );

    const [a, b] = await Promise.all([rafraichirAccessToken(), rafraichirAccessToken()]);

    expect(a).toBe("nouvel-access");
    expect(b).toBe("nouvel-access");
    expect(appels).toBe(1);
  });

  it("efface les tokens et appelle le handler de déconnexion si le refresh token est rejeté", async () => {
    seedTokens("ancien-access", "refresh-invalide");
    server.use(http.post("*/auth/refresh/", () => new HttpResponse(null, { status: 401 })));
    let logoutAppele = 0;
    const cleanup = registerLogoutHandler(() => {
      logoutAppele += 1;
    });

    await expect(rafraichirAccessToken()).rejects.toThrow();

    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(logoutAppele).toBe(1);
    cleanup();
  });
});

describe("tokenStore.registerLogoutHandler", () => {
  it("le cleanup retourné empêche un handler démonté d'être encore appelé", async () => {
    seedTokens("ancien-access", "refresh-invalide");
    server.use(http.post("*/auth/refresh/", () => new HttpResponse(null, { status: 401 })));
    let appeleHandlerDemonte = 0;
    const cleanup = registerLogoutHandler(() => {
      appeleHandlerDemonte += 1;
    });
    cleanup();

    await expect(rafraichirAccessToken()).rejects.toThrow();

    expect(appeleHandlerDemonte).toBe(0);
  });

  it("un nouvel enregistrement remplace le précédent, jamais d'accumulation", async () => {
    seedTokens("ancien-access", "refresh-invalide");
    server.use(http.post("*/auth/refresh/", () => new HttpResponse(null, { status: 401 })));
    let appelsA = 0;
    let appelsB = 0;
    registerLogoutHandler(() => {
      appelsA += 1;
    });
    const cleanupB = registerLogoutHandler(() => {
      appelsB += 1;
    });

    await expect(rafraichirAccessToken()).rejects.toThrow();

    expect(appelsA).toBe(0);
    expect(appelsB).toBe(1);
    cleanupB();
  });
});
