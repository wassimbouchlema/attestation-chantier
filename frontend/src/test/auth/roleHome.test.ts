import { describe, expect, it } from "vitest";

import type { Utilisateur } from "../../api/auth";
import { resolveHomePath } from "../../features/auth/roleHome";

const utilisateur = (role: Utilisateur["role"]): Utilisateur => {
  return { id: 1, username: "u", first_name: "F", last_name: "L", role };
};

describe("resolveHomePath", () => {
  it("renvoie /login quand aucun utilisateur n'est connecté", () => {
    expect(resolveHomePath(null)).toBe("/login");
  });

  it("renvoie /distributeur pour un DISTRIBUTEUR", () => {
    expect(resolveHomePath(utilisateur("DISTRIBUTEUR"))).toBe("/distributeur");
  });

  it("renvoie /siege pour un SIEGE", () => {
    expect(resolveHomePath(utilisateur("SIEGE"))).toBe("/siege");
  });
});
