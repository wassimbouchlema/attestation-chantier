# 03 — Modèle de données

Diagramme : [modèle de données](diagrams/modele-donnees.md).

## 1. Utilisateur

Modèle `comptes.Utilisateur`, dérivé de `AbstractUser`.

Champ métier supplémentaire :

| Champ | Type | Rôle |
| --- | --- | --- |
| `role` | choix | `DISTRIBUTEUR` ou `SIEGE` |

Une contrainte DB limite les valeurs à ces deux rôles.

## 2. Demande

`Demande` est l'agrégat central.

| Champ | Type | Description |
| --- | --- | --- |
| `id` | UUID | identifiant primaire |
| `distributeur` | FK Utilisateur | propriétaire de la demande |
| `statut` | choix | `BROUILLON`, `EN_COURS`, `TRAITE` |
| `decision` | choix nullable | `ACCEPTEE`, `REFUSEE` |
| `motif_refus` | texte | motif saisi par le SIÈGE |
| `commentaire_distributeur` | texte | commentaire transmis à l'envoi |
| `envoye_at` | datetime nullable | horodatage d'envoi |
| `fdr_pdf` | fichier nullable | snapshot PDF du FDR |
| `last_relance_at` | datetime nullable | dernière relance réussie |
| `created_at` | datetime | création |
| `updated_at` | datetime | dernière modification |

Ordre par défaut : création décroissante puis UUID décroissant.

## 3. FormulaireRisque

Relation **OneToOne** avec `Demande`, dont la clé primaire est également l'identifiant de la demande.

### Assuré

- `assure_nom`
- `assure_ville`
- `assure_numero_contrat`

### Chantier

- `chantier_nom`
- `chantier_ville`
- `type_chantier` : `NEUVE`, `RENOVATION`
- `modification_structure`
- `chantier_atypique`

### Usage et montant

- `usage` : `HABITATION`, `BUREAU`, `COMMERCE`, `AUTRE`
- `usage_autre_texte`
- `date_debut`
- `date_fin`
- `montant_total` : décimal `18,2`

### Intervention

- `intervention_description`
- `intervention_montant_prestation` : décimal `18,2`
- `intervention_type` : `PRINCIPALE`, `SOUS_TRAITANT`

### Questions métier

- `activite_couverte`
- `activite_non_couverte_texte`
- `travaux_standards`

Les contraintes de complétude ne sont pas entièrement portées par `NOT NULL`, car un FDR doit pouvoir représenter un brouillon partiel. La validation complète est appliquée au niveau métier avant création effective du brouillon depuis le nouvel écran et avant envoi.

## 4. PieceJustificative

Relation **N vers 1** vers `Demande`.

| Champ | Description |
| --- | --- |
| `id` | UUID |
| `demande` | demande propriétaire |
| `type_piece` | catégorie technique |
| `fichier` | fichier stocké sous chemin opaque |
| `nom_fichier_original` | nom d'affichage original |
| `uploaded_at` | date d'upload |

Catégories autorisées :

- `structure`
- `usage`
- `complexite`
- `montant`
- `activite`
- `travaux`

Plusieurs fichiers peuvent être associés à une même catégorie.

## 5. DemandeComplement

Relation **N vers 1** vers `Demande`.

| Champ | Description |
| --- | --- |
| `id` | UUID |
| `demande` | demande concernée |
| `message` | texte du SIÈGE |
| `requested_at` | date de demande |
| `received_at` | date de réception, nullable |

Contrainte : au maximum un complément avec `received_at IS NULL` pour une même demande.

Dans la version actuelle, aucun endpoint ne marque un complément comme reçu.

## 6. Notification

Relation **N vers 1** vers un destinataire et vers une demande.

| Champ | Description |
| --- | --- |
| `id` | UUID |
| `destinataire` | utilisateur destinataire |
| `demande` | demande liée |
| `type_notification` | type métier |
| `titre` | titre affiché |
| `message` | contenu |
| `created_at` | création |
| `seen_at` | horodatage de prise en compte dans le centre de notifications |

Types :

- `DEMANDE_ENVOYEE`
- `RELANCE`
- `COMPLEMENTS_DEMANDES`
- `DEMANDE_REFUSEE`
- `DEMANDE_ACCEPTEE`

`seen_at` représente l'état du badge du centre de notifications ; les notifications ne sont pas supprimées lorsqu'elles sont vues.

## 7. ProjetAttestation

Relation **OneToOne** avec `Demande`, avec la demande comme clé primaire.

| Champ | Description |
| --- | --- |
| `demande` | demande associée |
| `contenu_html` | corps éditable sanitizé |
| `created_at` | création |
| `updated_at` | dernière modification |

Ce modèle porte le projet du distributeur. Il ne stocke pas de copie structurée des données FDR.

## 8. Attestation

Relation **OneToOne** avec `Demande`.

| Champ | Description |
| --- | --- |
| `id` | UUID |
| `demande` | demande associée |
| `contenu_html` | contenu préparé/édité par le SIÈGE |
| `pdf_final` | PDF figé après validation |
| `validated_at` | horodatage de validation |
| `created_at` | création |
| `updated_at` | dernière modification |

`Attestation` et `ProjetAttestation` sont volontairement deux objets distincts.

## 9. Invariants métier principaux

### Statut / décision

Flux attendu :

```text
BROUILLON
  -> EN_COURS
      -> TRAITE / REFUSEE
      -> TRAITE / ACCEPTEE
```

Une demande acceptée possède une `Attestation` avec `pdf_final`.

### Ownership

Les endpoints distributeur ne retournent que les demandes appartenant à l'utilisateur connecté.

### Fichiers

- pièces et PDF FDR sont supprimés physiquement lors de la suppression d'un brouillon ;
- le PDF final est créé lors de la validation de l'attestation ;
- le stockage fichier étant externe à la transaction SQL, des nettoyages explicites sont prévus en cas d'échec.
