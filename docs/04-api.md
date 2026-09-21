# 04 — API

Base API : `/api/`.

L'API utilise Django REST Framework et l'authentification JWT SimpleJWT. Sauf endpoints d'authentification, les routes API sont protégées.

## 1. Authentification

| Méthode | Route | Accès | Usage |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login/` | public | obtenir `access` + `refresh` |
| `POST` | `/api/auth/refresh/` | public avec refresh token | renouveler l'access token |
| `GET` | `/api/auth/me/` | authentifié | profil et rôle courants |

Le frontend envoie ensuite `Authorization: Bearer <access>`.

## 2. Demandes distributeur

Toutes les routes de cette section nécessitent le rôle `DISTRIBUTEUR` et sont limitées aux demandes de l'utilisateur courant.

| Méthode | Route | Description |
| --- | --- | --- |
| `GET` | `/api/demandes/` | liste paginée des demandes |
| `POST` | `/api/demandes/` | création atomique d'une demande + FDR complet |
| `GET` | `/api/demandes/{id}/` | détail |
| `DELETE` | `/api/demandes/{id}/` | suppression d'un brouillon |
| `GET` | `/api/demandes/{id}/fdr/` | lire le FDR |
| `PATCH` | `/api/demandes/{id}/fdr/` | modifier un FDR en brouillon |
| `GET` | `/api/demandes/{id}/evaluation-risque/` | score/niveau/synthèse |
| `PATCH` | `/api/demandes/{id}/commentaire/` | commentaire distributeur en brouillon |
| `POST` | `/api/demandes/{id}/envoyer/` | valider, générer le PDF FDR, passer `EN_COURS` |
| `GET` | `/api/demandes/{id}/fdr-pdf/` | lire le snapshot PDF FDR |
| `POST` | `/api/demandes/{id}/relancer/` | relance email + notification |
| `GET` | `/api/demandes/{id}/attestation-finale/pdf/` | PDF définitif si demande acceptée |

### Pagination

`GET /api/demandes/` utilise la pagination DRF par page avec une taille de **10**.

### Filtres

Paramètres de requête supportés par la liste :

- `statut=BROUILLON|EN_COURS|TRAITE`
- `decision=ACCEPTEE|REFUSEE|EN_ATTENTE`
- `complements=DEMANDES|AUCUN`

`EN_ATTENTE` correspond aux demandes `EN_COURS` sans décision.

### Création

Payload :

```json
{
  "fdr": {
    "assure_nom": "...",
    "assure_ville": "...",
    "assure_numero_contrat": "1234567890123",
    "chantier_nom": "...",
    "chantier_ville": "...",
    "type_chantier": "NEUVE",
    "modification_structure": null,
    "chantier_atypique": false,
    "usage": "HABITATION",
    "usage_autre_texte": "",
    "date_debut": "2026-01-01",
    "date_fin": "2026-12-31",
    "montant_total": "1000000.00",
    "intervention_description": "...",
    "intervention_montant_prestation": "250000.00",
    "intervention_type": "PRINCIPALE",
    "activite_couverte": true,
    "activite_non_couverte_texte": "",
    "travaux_standards": true
  }
}
```

Le backend crée `Demande` et `FormulaireRisque` dans une transaction. Un FDR incomplet renvoie `400` avec :

```json
{
  "code": "FDR_INVALIDE",
  "erreurs": {
    "champ": "message"
  }
}
```

### Envoi

`POST /api/demandes/{id}/envoyer/` accepte facultativement :

```json
{
  "commentaire_distributeur": "..."
}
```

Erreurs métier principales :

- `400 FDR_INVALIDE`
- `400 DOSSIER_INCOMPLET`
- `409` si la demande n'est plus un brouillon.

## 3. Pièces justificatives

Rôle `DISTRIBUTEUR` :

| Méthode | Route | Description |
| --- | --- | --- |
| `GET` | `/api/demandes/{id}/pieces/` | liste + requises + manquantes + complétude |
| `POST` | `/api/demandes/{id}/pieces/` | upload multipart |
| `DELETE` | `/api/demandes/{id}/pieces/{piece_id}/` | supprimer une pièce |

Payload multipart :

- `type_piece`
- `fichier`

Formats autorisés : PDF, JPEG, PNG.

Les mutations sont limitées au statut `BROUILLON`.

## 4. Projet d'attestation distributeur

Rôle `DISTRIBUTEUR` :

| Méthode | Route | Description |
| --- | --- | --- |
| `GET` | `/api/demandes/{id}/projet-attestation/` | récupérer le projet, `404` s'il n'existe pas |
| `POST` | `/api/demandes/{id}/projet-attestation/` | créer le projet à partir du FDR |
| `PATCH` | `/api/demandes/{id}/projet-attestation/` | enregistrer `contenu_html` |
| `GET` | `/api/demandes/{id}/projet-attestation/pdf/` | générer le PDF du contenu enregistré |

La création n'est autorisée que pour une demande `EN_COURS`.

Erreurs spécifiques :

- `409 PROJET_NON_AUTORISE`
- `409 PROJET_DEJA_EXISTANT`

## 5. Demandes SIÈGE

Toutes les routes nécessitent `SIEGE`.

Le queryset principal ne contient que les demandes `EN_COURS`.

| Méthode | Route | Description |
| --- | --- | --- |
| `GET` | `/api/siege/demandes/` | liste paginée des demandes à traiter |
| `GET` | `/api/siege/demandes/{id}/` | détail d'une demande en cours |
| `GET` | `/api/siege/demandes/{id}/pieces/` | synthèse des justificatifs |
| `GET` | `/api/siege/demandes/{id}/evaluation-risque/` | évaluation fictive du risque |
| `GET` | `/api/siege/demandes/{id}/fdr-pdf/` | snapshot FDR |
| `POST` | `/api/siege/demandes/{id}/demander-complements/` | créer une demande de compléments |
| `POST` | `/api/siege/demandes/{id}/refuser/` | refuser la demande |

### Demande de compléments

Payload :

```json
{ "message": "..." }
```

Une seconde demande active renvoie :

```json
{
  "code": "COMPLEMENTS_DEJA_DEMANDES",
  "detail": "..."
}
```

### Refus

Payload :

```json
{ "motif": "..." }
```

Le refus met immédiatement la demande en `TRAITE / REFUSEE`.

## 6. Fichier d'une pièce côté SIÈGE

| Méthode | Route | Description |
| --- | --- | --- |
| `GET` | `/api/siege/demandes/{demande_id}/pieces/{piece_id}/fichier/` | sert le fichier à un utilisateur SIÈGE |

Le téléchargement n'est disponible que pour une demande `EN_COURS`.

Aucune URL publique de média n'est exposée.

## 7. Attestation SIÈGE

| Méthode | Route | Description |
| --- | --- | --- |
| `POST` | `/api/siege/demandes/{id}/attestation/preparer/` | créer ou retourner l'attestation de travail |
| `GET` | `/api/siege/demandes/{id}/attestation/` | charger l'attestation |
| `PATCH` | `/api/siege/demandes/{id}/attestation/` | sauvegarder le HTML |
| `GET` | `/api/siege/demandes/{id}/attestation/pdf/` | prévisualisation PDF |
| `POST` | `/api/siege/demandes/{id}/attestation/analyser-coherence/` | contrôle de cohérence |
| `POST` | `/api/siege/demandes/{id}/attestation/valider/` | validation finale et acceptation |

La préparation retourne `201` lors de la création et `200` si l'attestation existe déjà.

La validation finale peut renvoyer :

- `409 ATTESTATION_DEJA_VALIDEE`
- `409 DEMANDE_NON_TRAITABLE`
- `409 ATTESTATION_VIDE`
- `404` si l'attestation n'existe pas.

L'analyse de cohérence peut renvoyer `503 IA_INDISPONIBLE`.

## 8. Réponse du contrôle de cohérence

Forme :

```json
{
  "backend": "mistral",
  "coherent": false,
  "resume": "...",
  "anomalies": [
    {
      "type": "VALEUR_DIFFERENTE",
      "champ": "montant_total",
      "valeur_fdr": "1000000.00",
      "valeur_attestation": "900 000,00",
      "message": "..."
    }
  ]
}
```

Types d'anomalie :

- `VALEUR_DIFFERENTE`
- `INFORMATION_ABSENTE`
- `CONTRADICTION`

## 9. Notifications

Tous utilisateurs authentifiés :

| Méthode | Route | Description |
| --- | --- | --- |
| `GET` | `/api/notifications/` | historique + compteur `non_vues` |
| `POST` | `/api/notifications/marquer-vues/` | renseigne `seen_at` en batch |

Payload batch :

```json
{ "ids": ["uuid-1", "uuid-2"] }
```

## 10. Reporting

| Méthode | Route | Accès | Description |
| --- | --- | --- | --- |
| `GET` | `/api/reporting/` | authentifié | compteurs adaptés au rôle |

Réponse :

```json
{
  "total": 4,
  "brouillons": 1,
  "en_cours": 2,
  "acceptees": 1,
  "refusees": 0
}
```

## 11. Routes d'exploitation et développement

### Santé

```text
GET /healthz
```

Retour : `200 text/plain` avec `ok`.

Le middleware répond avant la validation `ALLOWED_HOSTS`, ce qui le rend adapté aux probes d'un orchestrateur.

### Admin Django

```text
/admin/
```

### OpenAPI / Swagger

Disponibles uniquement lorsque `DEBUG=True` :

- `/api/schema/`
- `/api/docs/`

Deux routes de test de rôle sont également ajoutées uniquement en mode développement.
