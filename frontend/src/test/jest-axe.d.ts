// jest-axe ne fournit aucun typage TypeScript (ni "types" dans son package.json,
// ni .d.ts dans son tarball) — @types/jest-axe existe mais est figé depuis 2023
// et cible l'espace de noms `jest`, pas Vitest. On déclare ici uniquement la
// surface qu'on utilise réellement (axe + toHaveNoViolations), typée à partir
// des vrais types d'axe-core (celui-ci en fournit).
//
// Ce fichier ne doit contenir aucun import/export de haut niveau : dès qu'un
// fichier .d.ts a un import/export de haut niveau, TypeScript le traite comme
// un module, et `declare module "jest-axe"` devient alors une augmentation
// (qui échoue silencieusement, faute de module "jest-axe" existant à
// augmenter) plutôt qu'une déclaration ambiante — d'où ce fichier séparé de
// vitest-matchers.d.ts.
declare module "jest-axe" {
  import AxeCore = require("axe-core");

  export const axe: (html: Element | string, options?: AxeCore.RunOptions) => Promise<AxeCore.AxeResults>;

  export const toHaveNoViolations: {
    toHaveNoViolations(results: AxeCore.AxeResults): { pass: boolean; message: () => string };
  };
}
