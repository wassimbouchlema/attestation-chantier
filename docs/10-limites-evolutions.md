# 10 — Limites et évolutions

Ce document distingue les limites observables dans la version actuelle des pistes d'évolution. Les éléments de cette section ne doivent pas être confondus avec des fonctionnalités déjà implémentées.

## 1. Boucle de compléments incomplète

### Actuel

Le SIÈGE peut créer une demande de compléments et le distributeur la voit dans son dossier.

Cependant :

- les uploads de pièces sont interdits après le passage en `EN_COURS` ;
- aucun endpoint ne permet de répondre formellement au complément ;
- `DemandeComplement.received_at` n'est jamais renseigné par un parcours métier.

### Évolution

Introduire un état de réponse aux compléments :

1. autoriser explicitement le distributeur à déposer des pièces complémentaires ;
2. soumettre la réponse ;
3. renseigner `received_at` ;
4. notifier le SIÈGE ;
5. permettre une nouvelle demande ultérieure si nécessaire.

## 2. Hypothèse d'un unique compte SIÈGE

### Actuel

`obtenir_compte_siege_unique()` exige exactement un utilisateur de rôle `SIEGE`.

Cette simplification suffit à une démonstration mais ne modélise pas :

- une équipe ;
- l'affectation ;
- les portefeuilles ;
- la suppléance.

### Évolution

Ajouter une notion d'assignation du dossier et des règles d'escalade/SLA.

## 3. Projet distributeur indépendant de l'attestation SIÈGE

### Actuel

Le `ProjetAttestation` et l'`Attestation` sont deux documents séparés.

La préparation SIÈGE repart du FDR et ne reprend pas automatiquement les modifications HTML du distributeur.

### Évolution possible

Si le métier le souhaite, proposer au SIÈGE une action explicite « reprendre le projet du distributeur » avec :

- traçabilité de l'origine ;
- diff ;
- confirmation humaine ;
- conservation de la version initiale SIÈGE.

Le comportement ne devrait pas devenir implicite.

## 4. Stockage JWT dans `localStorage`

### Actuel

Access et refresh token sont stockés dans `localStorage`.

### Risque

Un XSS réussi pourrait lire ces tokens.

### Évolution

Utiliser une session basée sur cookies :

- `HttpOnly` ;
- `Secure` ;
- `SameSite` ;
- protection CSRF appropriée ;
- éventuellement rotation/révocation renforcée des refresh tokens.

## 5. Validation des fichiers perfectible

### Actuel

Extension et type MIME sont contrôlés.

### Limites

- pas de limite applicative de taille ;
- pas de signature/magic bytes ;
- pas d'antivirus ;
- pas de quarantaine.

### Évolution

Pipeline d'upload : limite de taille, inspection de contenu, antivirus, quarantaine puis publication dans le stockage privé.

## 6. Identité Azure pour le stockage

### Actuel

Azure Blob Storage accepte connection string ou compte + clé.

### Évolution

Utiliser Managed Identity + RBAC afin de réduire la présence de secrets statiques pour le stockage.

## 7. Déploiement backend non automatisé dans le dépôt

### Actuel

Le frontend possède un workflow Azure Static Web Apps. Le backend possède un `Dockerfile`, mais pas de pipeline de build/push/deploy versionnée ni d'Infrastructure as Code.

### Évolution

Ajouter :

- pipeline de tests ;
- build d'image ;
- scan de l'image ;
- push registry ;
- migration contrôlée ;
- déploiement Container Apps ;
- smoke test `/healthz` ;
- IaC Bicep/Terraform pour base, stockage, secrets et réseau.

## 8. URL backend de frontend couplée au workflow

### Actuel

Le workflow Static Web Apps définit directement `VITE_API_BASE_URL`.

### Évolution

Utiliser des environnements GitHub ou des variables par stage pour faciliter dev/recette/prod et éviter de modifier le workflow à chaque environnement.

## 9. Scoring de risque fictif

### Actuel

Le score est déterministe et explicitement démonstratif.

### Évolution

Si un vrai moteur de souscription devait être introduit :

- gouvernance métier ;
- versionnement des règles ;
- explication des facteurs ;
- tests de non-régression ;
- auditabilité ;
- validation actuarielle/compliance.

Le score actuel ne doit pas être présenté comme une mesure réelle du risque.

## 10. Contrôle IA : disponibilité et couverture

### Actuel

Mistral peut être indisponible et la simulation ne compare qu'un sous-ensemble de champs via expressions régulières.

### Évolution

- métriques de qualité du contrôle ;
- jeu de tests métier anonymisé ;
- gestion des versions de prompt/modèle ;
- observabilité sans journaliser les documents sensibles ;
- stratégie de repli maîtrisée.

L'IA doit rester consultative.

## 11. Localisation visuelle des incohérences

### Actuel

L'anomalie remonte un identifiant `champ`, mais l'éditeur ne possède pas d'ancres sémantiques stables dans son HTML.

### Évolution

Associer chaque anomalie à la zone correspondante de l'éditeur et appliquer un surlignage temporaire non persisté.

Précondition : introduire un modèle d'édition avec ancres fiables afin d'éviter un mapping textuel fragile.

## 12. Historique et audit métier

### Actuel

Les modèles conservent des timestamps, décisions, notifications et documents figés, mais il n'existe pas de journal d'audit générique des modifications.

### Évolution

Ajouter un audit append-only pour les événements importants :

- modification du FDR ;
- ajout/retrait de pièce ;
- envoi ;
- consultation/décision ;
- modifications d'attestation ;
- validation ;
- changements d'affectation.

## 13. Versionnement des attestations

### Actuel

Le contenu HTML courant est remplacé à chaque sauvegarde avant validation.

### Évolution

Conserver des versions afin de :

- comparer deux révisions ;
- restaurer une version ;
- tracer l'auteur et l'heure ;
- conserver la version examinée lors du contrôle de cohérence.

## 14. Signature et valeur probante

### Actuel

Le PDF définitif est figé à la validation applicative, sans signature électronique cryptographique.

### Évolution

Selon le niveau juridique attendu :

- scellement du PDF ;
- signature électronique ;
- horodatage qualifié ;
- conservation probante ;
- vérification d'intégrité.

## 15. Accessibilité

### Actuel

Le frontend utilise Canopée et des tests automatisés `jest-axe` ciblés.

### Limite

Aucun audit RGAA complet n'est versionné.

### Évolution

Réaliser un audit manuel et automatique :

- navigation clavier ;
- focus ;
- lecteur d'écran ;
- contrastes ;
- zoom/reflow ;
- restitution des erreurs ;
- documents PDF accessibles.

## 16. Tests de bout en bout

### Actuel

Le dépôt possède une couverture importante backend et frontend, mais pas de suite navigateur E2E versionnée.

### Évolution

Ajouter quelques parcours Playwright/Cypress ciblés sur les scénarios critiques :

- création et envoi ;
- pièces requises ;
- traitement SIÈGE ;
- validation finale ;
- relance ;
- expiration/refresh de session.

## 17. Reporting

### Actuel

Le reporting se limite à cinq compteurs.

### Évolutions digitales possibles

- délai moyen entre envoi et décision ;
- dossiers en attente de compléments ;
- distribution des facteurs de risque ;
- SLA par équipe ;
- tendances temporelles ;
- export CSV ;
- filtres par période et portefeuille.

## 18. Aide à la saisie et automatisation documentaire

Évolutions envisageables, non implémentées :

- extraction assistée des justificatifs ;
- préremplissage contrôlé du FDR ;
- détection de doublons ;
- contrôle de dates/montants dans les documents ;
- suggestion de pièces supplémentaires, toujours validée par un humain.

Ces fonctionnalités nécessiteraient une gestion stricte de la confiance, de la traçabilité et des données sensibles.
