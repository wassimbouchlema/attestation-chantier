// Même pattern d'augmentation que celui utilisé par @testing-library/jest-dom/vitest
// (voir node_modules/@testing-library/jest-dom/types/vitest.d.ts) pour exposer
// le matcher côté typage à `expect(...).toHaveNoViolations()`. L'import est
// nécessaire : sans lui, ce bloc redéfinit le module "vitest" au lieu de
// l'augmenter, et fait disparaître tous ses exports réels (describe, it, expect...).
import "vitest";

declare module "vitest" {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): void;
  }
}
