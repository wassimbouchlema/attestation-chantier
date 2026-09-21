# 08 — Tests

## 1. Organisation

Le dépôt contient :

- **271 méthodes `test_*` backend** réparties dans les tests Django ;
- **24 fichiers de tests frontend** sous `frontend/src/test`.

Ces nombres décrivent le code versionné. Le nombre exact de cas exécutés par Vitest peut être supérieur si un fichier utilise des formes paramétrées.

## 2. Backend

Les tests couvrent notamment :

- authentification et rôles ;
- demandes et ownership ;
- création atomique du FDR ;
- validation du FDR ;
- détection des pièces ;
- upload et suppression de justificatifs ;
- évaluation de risque ;
- envoi et snapshot PDF ;
- notifications ;
- relance ;
- projet d'attestation ;
- traitement SIÈGE ;
- demande de compléments ;
- refus ;
- préparation d'attestation ;
- validation finale ;
- contrôle de cohérence ;
- reporting.

Fichiers principaux :

```text
backend/comptes/tests.py
backend/demandes/tests/test_*.py
```

### Commandes

```bash
cd backend
python manage.py test
python manage.py check
python manage.py makemigrations --check
```

`manage.py check` contrôle la configuration Django et `makemigrations --check` détecte un modèle modifié sans migration correspondante.

## 3. Frontend

Le frontend utilise :

- Vitest ;
- React Testing Library ;
- `@testing-library/user-event` ;
- MSW pour simuler les API ;
- `jest-axe` pour des contrôles automatiques d'accessibilité ciblés.

Les tests couvrent notamment :

- session et refresh JWT ;
- login et routing protégé ;
- création du FDR ;
- état des sections ;
- pièce et risque ;
- validation/envoi ;
- consultation distributeur ;
- notifications ;
- projet d'attestation ;
- écrans SIÈGE ;
- édition/validation d'attestation ;
- présentation du reporting ;
- helpers de formatage.

### Commandes

```bash
cd frontend
npm test
npm run lint
npm run build
```

`npm run build` exécute `tsc -b` avant Vite, et constitue donc aussi un contrôle de type TypeScript.

## 4. Stratégie d'accessibilité

Plusieurs tests intègrent `jest-axe` et les composants utilisent les primitives du design system Canopée.

Cela permet de détecter certaines erreurs automatisables, mais ne constitue pas :

- un audit RGAA ;
- une validation manuelle clavier/lecteur d'écran complète ;
- une déclaration de conformité.

## 5. Ce qui est particulièrement testé côté métier

### Permissions

Les tests vérifient que les actions DISTRIBUTEUR et SIÈGE ne sont pas interchangeables et que les ressources distributeur restent cloisonnées par propriétaire.

### Cas limites de statut

De nombreuses mutations retournent `409` lorsqu'une demande a dépassé l'état dans lequel elle est modifiable.

### Fichiers

Les tests portent sur :

- les types autorisés ;
- le stockage ;
- la suppression ;
- les PDF FDR/projet/final.

### Validation finale

La validation d'attestation est testée comme une transition atomique : génération du fichier, mise à jour de l'attestation, décision de la demande et notification.

### IA

Le backend de simulation permet des tests déterministes du contrat de cohérence sans appel réseau externe.

## 6. CI présente dans le dépôt

Le workflow GitHub Actions versionné est orienté build/déploiement du frontend Azure Static Web Apps.

Il ne contient pas actuellement de job séparé exécutant l'intégralité des tests backend et frontend avant déploiement.

Une évolution recommandée serait d'ajouter une pipeline de qualité indépendante comprenant au minimum :

```text
backend: test + check + makemigrations --check
frontend: test + lint + build
```

avant tout job de déploiement.
