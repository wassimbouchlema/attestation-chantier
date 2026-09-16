/**
 * État affiché pendant la vérification de session (restauration au
 * chargement) — remplace un rendu vide (`return null`), annoncé aux
 * lecteurs d'écran via role="status" (région live implicite).
 */
export const SessionLoader = () => <p role="status">Vérification de la session…</p>;
