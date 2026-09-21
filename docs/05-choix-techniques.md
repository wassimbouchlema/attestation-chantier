# 05 — Choix techniques

## 1. Django + Django REST Framework

Django fournit :

- ORM et migrations ;
- modèle utilisateur ;
- transactions ;
- sécurité de base ;
- stockage de fichiers abstrait ;
- administration.

DRF structure l'API autour de serializers, permissions, viewsets et actions métiers.

Ce choix est adapté à un domaine transactionnel où les règles d'autorisation et les transitions d'état doivent rester côté serveur.

## 2. PostgreSQL

Les relations fortes du domaine — demande, FDR, pièces, notifications, compléments et attestations — se prêtent naturellement à un modèle relationnel.

PostgreSQL permet également d'appuyer les invariants par des contraintes :

- valeurs de rôle ;
- valeurs de statut ;
- valeurs de notification ;
- unicité d'un complément actif par demande.

## 3. UUID sur les objets métier exposés

Les demandes, pièces, notifications, attestations et compléments utilisent des UUID.

Cela évite d'exposer une simple séquence incrémentale comme identifiant public. Les permissions restent toutefois indispensables : l'UUID n'est pas considéré comme un contrôle d'accès.

## 4. React + TypeScript + Vite

Le frontend est une SPA React typée en TypeScript et construite avec Vite.

Raisons visibles dans l'architecture :

- écrans interactifs avec parcours multi-étapes ;
- formulaires riches ;
- cache serveur ;
- édition WYSIWYG ;
- séparation claire composants / orchestration / appels API.

## 5. Canopée 1.8.0

Le lockfile résout `@axa-fr/canopee-react` et `@axa-fr/canopee-css` en version **1.8.0**.

Le design system est utilisé comme base des composants d'interface, notamment pour les parcours, messages, tags, modales et champs.

Le code ajoute du CSS spécifique lorsque nécessaire mais conserve les composants du design system comme primitives principales.

## 6. React Hook Form + Zod

Le FDR combine :

- nombreuses valeurs ;
- sections indépendantes ;
- règles conditionnelles ;
- règles croisées entre sections.

React Hook Form porte l'état de saisie et Zod porte les validations frontend.

Un schéma final unique compose les sections afin de conserver les règles croisées dans un seul `superRefine`, notamment :

- dates ;
- montant de prestation < montant total ;
- texte obligatoire lorsque l'usage est `AUTRE` ;
- justification d'activité non couverte.

Le backend répète volontairement les validations critiques : le navigateur n'est jamais la source de vérité de sécurité ou de métier.

## 7. TanStack Query

TanStack Query gère l'état serveur plutôt qu'un store global maison :

- cache ;
- chargement ;
- erreurs ;
- mutations ;
- invalidation.

Les retries automatiques sont désactivés. Le transport HTTP possède déjà une seule stratégie de récupération automatique utile : `401 -> refresh JWT -> retry une fois`.

## 8. React Router comme état de parcours

L'étape du wizard FDR est reflétée dans l'URL.

Ce choix :

- rend la navigation explicite ;
- évite un état d'étape caché dans un store global ;
- permet des routes de consultation séparées des routes d'édition.

## 9. Aucun brouillon DB à l'ouverture du formulaire

Le premier écran d'une nouvelle demande est local. Le backend n'est appelé que lorsque les informations FDR sont valides.

Bénéfices :

- pas de pollution de la base par des ouvertures abandonnées ;
- sémantique claire : un `BROUILLON` en base représente une demande effectivement confirmée ;
- création `Demande + FormulaireRisque` atomique.

## 10. Moteur de règles backend pur

`calculer_pieces_requises` est une fonction pure, sans requête SQL ni effet de bord.

Cela permet :

- des tests simples ;
- une source de vérité unique ;
- le calcul sur un FDR partiel ;
- l'absence de duplication des six règles dans les vues et serializers.

Le scoring de risque est maintenu dans une fonction pure séparée. Le couplage fonctionnel actuel entre certains critères ne doit pas devenir un couplage technique.

## 11. Snapshot PDF FDR avec ReportLab

Le FDR PDF représente l'état au moment de l'envoi. Le générer une seule fois puis le stocker apporte une propriété importante : le document consulté ensuite est exactement l'artefact envoyé.

ReportLab est utilisé pour un PDF structuré entièrement côté serveur, sans dépendre d'un moteur navigateur.

## 12. Attestations HTML + xhtml2pdf

Pour les attestations, le besoin est différent : le SIÈGE et le distributeur éditent un corps riche.

La solution combine :

- Quill côté frontend ;
- HTML persisté ;
- nettoyage Bleach côté backend ;
- gabarit institutionnel fixe côté backend ;
- xhtml2pdf pour le rendu.

Le gabarit, la marque et les métadonnées ne dépendent donc pas du contenu éditable envoyé par le navigateur.

## 13. Sanitization par liste blanche

Le backend n'accepte qu'un sous-ensemble minimal de balises utiles à l'éditeur et aucun attribut.

Ce choix réduit fortement la surface XSS du contenu riche et évite de faire confiance à une éventuelle sanitization côté frontend.

## 14. JWT SimpleJWT

L'API utilise JWT pour une SPA découplée du backend.

Le frontend :

- conserve access + refresh token ;
- tente un refresh sur un premier `401` ;
- déduplique les refresh simultanés ;
- nettoie la session lorsque le refresh est définitivement rejeté.

Le stockage en `localStorage` reste un compromis de cette version et est documenté comme limite de sécurité.

## 15. IA à sortie structurée

Le contrôle Mistral n'est pas un chatbot libre.

La réponse est contrainte par un modèle Pydantic strict :

- booléen de cohérence ;
- résumé ;
- anomalies typées ;
- identifiant de champ FDR ;
- valeurs comparées ;
- message factuel.

Cela rend la réponse exploitable par l'UI et réduit les ambiguïtés d'intégration.

## 16. Simulation derrière le même contrat

`AI_COHERENCE_BACKEND=simulation` permet d'exécuter localement le parcours sans clé Mistral.

Le même endpoint et une forme de réponse commune sont utilisés. Ce choix isole l'UI de l'implémentation du moteur.

## 17. Azure abstrait par configuration

Le backend n'importe pas de logique Azure dans le domaine métier.

Le stockage bascule via `STORAGES` lorsque les variables Azure sont fournies. La base passe par `DATABASE_URL` ou variables PostgreSQL. Le SMTP et Mistral sont également configurables par environnement.

Cette approche garde le code local exécutable tout en permettant un déploiement cloud.
