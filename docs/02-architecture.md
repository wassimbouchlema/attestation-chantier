# 02 — Architecture

## 1. Vue d'ensemble

L'application suit une architecture web classique séparant un frontend SPA et une API REST.

```text
Navigateur
  ├─ React / TypeScript / Vite
  ├─ API publique geo.api.gouv.fr pour l'autocomplétion de ville
  └─ HTTP JSON / multipart / PDF
          ↓
Django + Django REST Framework
  ├─ authentification JWT
  ├─ règles métier FDR / pièces / risque
  ├─ génération de documents
  ├─ traitement SIÈGE
  ├─ notifications / email
  └─ contrôle de cohérence
          ↓
PostgreSQL + stockage de fichiers + services externes
```

Diagramme détaillé : [architecture](diagrams/architecture.md).

## 2. Backend

Le backend est organisé autour de deux applications Django.

### `comptes`

Responsabilités :

- modèle utilisateur custom `Utilisateur` ;
- rôles `DISTRIBUTEUR` et `SIEGE` ;
- permissions DRF ;
- profil `/api/auth/me/` ;
- résolution du compte SIÈGE unique.

### `demandes`

Responsabilités :

- cycle de vie des demandes ;
- FDR ;
- pièces justificatives ;
- évaluation de risque ;
- PDF FDR ;
- projet d'attestation ;
- attestation définitive ;
- traitement SIÈGE ;
- analyse de cohérence ;
- notifications ;
- relances ;
- reporting.

## 3. Découpage métier backend

Plusieurs règles importantes sont isolées hors des vues HTTP.

| Module | Responsabilité |
| --- | --- |
| `rules.py` | calcul pur des pièces requises/manquantes |
| `evaluation_risque.py` | scoring fictif et niveau de risque |
| `validation_envoi.py` | complétude métier du FDR avant envoi |
| `validators.py` | validateurs de format partagés côté API |
| `pdf.py` | génération ReportLab du snapshot FDR |
| `projet_attestation.py` | corps HTML initial à partir du FDR |
| `projet_attestation_pdf.py` | gabarit commun et PDF des attestations |
| `html_sanitization.py` | liste blanche HTML |
| `analyse_coherence.py` | contrat IA, simulation et appel Mistral |

Cette séparation permet aux vues DRF de rester centrées sur :

- les permissions ;
- la récupération des ressources ;
- les transitions d'état ;
- les transactions ;
- la construction de la réponse HTTP.

## 4. Transactions et concurrence

Les opérations modifiant une transition métier utilisent `transaction.atomic()` et, lorsque nécessaire, `select_for_update()`.

Exemples :

- envoi d'une demande ;
- relance ;
- préparation/validation d'une attestation ;
- refus ;
- demande de compléments.

Objectif : éviter deux transitions concurrentes sur une même demande et garder les changements DB cohérents.

Les fichiers ne sont pas transactionnels avec PostgreSQL. Le code prévoit donc des suppressions défensives lorsque la génération/écriture d'un PDF a eu lieu avant une exception.

## 5. Frontend

Le frontend suit un découpage par fonctionnalités :

```text
src/
├── api/
├── features/
│   ├── auth/
│   ├── demandes/
│   ├── fdr/
│   ├── notifications/
│   ├── projetAttestation/
│   ├── attestation/
│   ├── reporting/
│   └── siege/
├── layout/
├── pages/
├── routes/
└── test/
```

### Pages et composants

Les fichiers `.tsx` portent principalement la composition et le rendu.

La logique d'orchestration est fréquemment déplacée dans des hooks colocalisés, par exemple :

- `FdrInformationsPage.tsx` / `useFdrInformationsPage.ts` ;
- `AttestationPage.tsx` / `useAttestationPage.ts` ;
- `SiegeDemandeConsultationPage.tsx` / `useSiegeDemandeConsultationPage.ts`.

Les calculs purs vivent dans des helpers, et les appels/cache serveur dans les fichiers `queries.ts` des fonctionnalités.

## 6. Gestion de l'état frontend

Trois types d'état sont volontairement séparés.

### État du formulaire

**React Hook Form** porte les valeurs FDR non sauvegardées.

Le formulaire complet utilise un resolver **Zod** unique, composé à partir de schémas par section.

### État serveur

**TanStack Query** gère :

- chargements ;
- cache ;
- mutations ;
- invalidations/refetch.

Les retries automatiques sont désactivés globalement pour éviter de répéter des erreurs métier/HTTP qui ne se résolvent pas spontanément.

### Navigation

**React Router** représente l'étape du parcours :

- `/informations` ;
- `/pieces` ;
- `/validation`.

Aucun store global métier de type Redux/Zustand n'est nécessaire dans la version actuelle.

## 7. Création sans brouillon vide

La page `/distributeur/demandes/nouvelle` initialise uniquement un formulaire local.

Le premier `POST /api/demandes/` n'est exécuté qu'après validation complète des informations. Le backend crée alors atomiquement :

- `Demande(BROUILLON)` ;
- `FormulaireRisque` associé.

Ce choix évite d'accumuler des brouillons vides simplement parce qu'un utilisateur a ouvert l'écran de création.

## 8. Hydratation du wizard

Pour une demande existante, `FdrWizardLayout` :

- charge la demande via TanStack Query ;
- possède un unique `FormProvider` ;
- hydrate React Hook Form une seule fois par identifiant de demande ;
- évite qu'un refetch ultérieur n'écrase une modification locale non enregistrée.

L'hydratation est réalisée en `useLayoutEffect` afin que les hooks descendants lisent immédiatement les valeurs réinitialisées.

## 9. Transport HTTP et session

Le transport HTTP est centralisé :

- `http.ts` construit les appels à `VITE_API_BASE_URL` ;
- `httpAuthentifie.ts` ajoute le Bearer token ;
- sur un premier `401`, un refresh JWT est tenté ;
- la requête est rejouée une seule fois ;
- les refresh concurrents sont dédupliqués dans `tokenStore.ts`.

Les tokens sont actuellement stockés dans `localStorage`.

## 10. Documents

### FDR

`pdf.py` génère le PDF avec ReportLab au moment de l'envoi. Le fichier est ensuite servi tel quel.

### Attestations

Le corps HTML et le gabarit fixe sont séparés :

- `projet_attestation.py` génère le contenu initial ;
- l'éditeur modifie uniquement le corps ;
- `projet_attestation_pdf.py` ajoute en-tête, références, titre, marquage et pied ;
- xhtml2pdf produit le PDF.

Le même gabarit de génération sert aux trois variantes :

- projet distributeur ;
- prévisualisation SIÈGE ;
- PDF définitif.

## 11. Stockage des fichiers

En développement, Django utilise le filesystem sous `backend/media`.

Si une configuration Azure est fournie, `django-storages` bascule le stockage métier vers Azure Blob Storage.

Le conteneur est attendu privé et aucun `MEDIA_URL` public n'est configuré. Les fichiers utiles au SIÈGE sont servis via des endpoints Django protégés.

## 12. Déploiement

Le backend dispose d'un `Dockerfile` :

- image Python 3.12 slim ;
- installation des dépendances ;
- `collectstatic` au build ;
- exécution avec un utilisateur non root ;
- Gunicorn sur `0.0.0.0:8000` ;
- deux workers ;
- logs vers stdout/stderr.

Le frontend est déployable via le workflow GitHub Actions Azure Static Web Apps présent dans `.github/workflows/`.

Le provisioning complet du backend, de PostgreSQL et du stockage n'est pas décrit en Infrastructure as Code dans le dépôt.
