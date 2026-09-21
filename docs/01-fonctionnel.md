# 01 — Fonctionnel

## 1. Objectif

L'application gère un dossier de demande d'attestation de chantier autour d'un **formulaire de déclaration du risque (FDR)**.

Le résultat fonctionnel couvert par le code est le suivant :

1. saisir un FDR ;
2. calculer automatiquement les pièces justificatives nécessaires ;
3. évaluer de façon indicative le niveau de risque ;
4. envoyer la demande au SIÈGE ;
5. permettre au SIÈGE de traiter la demande ;
6. générer et éditer les documents d'attestation ;
7. contrôler automatiquement la cohérence entre le FDR et l'attestation ;
8. notifier les acteurs et permettre une relance ;
9. présenter une synthèse simple des demandes.

## 2. Acteurs

### DISTRIBUTEUR

Le rôle `DISTRIBUTEUR` :

- crée le FDR ;
- complète les données de l'assuré, du chantier et de l'intervention ;
- dépose les pièces justificatives requises ;
- consulte l'évaluation de risque ;
- envoie le dossier au SIÈGE ;
- consulte ensuite l'avancement et les décisions ;
- peut relancer une demande `EN_COURS` ;
- peut créer et éditer un **projet d'attestation** tant que la demande reste `EN_COURS` ;
- télécharge l'attestation définitive lorsqu'elle a été validée par le SIÈGE.

### SIÈGE

Le rôle `SIEGE` :

- consulte les demandes `EN_COURS` ;
- consulte le FDR, les justificatifs et l'évaluation de risque ;
- demande des compléments ;
- refuse une demande avec motif ;
- prépare une attestation à partir du FDR ;
- édite et prévisualise cette attestation ;
- lance un contrôle de cohérence ;
- valide humainement l'attestation définitive, ce qui accepte la demande et fige le PDF final.

## 3. Terminologie documentaire

Trois documents doivent être distingués.

### PDF FDR

Snapshot du dossier au moment de `POST /api/demandes/{id}/envoyer/`.

- généré une seule fois avec ReportLab ;
- stocké sur la demande ;
- non régénéré au téléchargement ;
- reflète les déclarations du distributeur ;
- n'intègre pas le score fictif de risque.

### Projet d'attestation

Document éditable par le distributeur pour une demande `EN_COURS`.

- instance `ProjetAttestation` ;
- création explicite, jamais automatique ;
- corps HTML prérempli à partir du FDR ;
- contenu ensuite éditable ;
- HTML nettoyé côté serveur ;
- PDF généré à la demande ;
- mention `NON DÉFINITIF` dans le gabarit PDF.

### Attestation SIÈGE

Document distinct, porté par le modèle `Attestation`.

- préparé par le SIÈGE à partir du FDR ;
- ne reprend pas automatiquement le HTML du `ProjetAttestation` distributeur ;
- modifiable tant que la demande est traitable et que l'attestation n'est pas validée ;
- prévisualisable avec marquage de prévisualisation ;
- figé en PDF à la validation finale ;
- la validation positionne la demande en `TRAITE / ACCEPTEE`.

Voir [cycle des documents](diagrams/cycle-documents.md).

## 4. Cycle d'une demande

### 4.1 Nouvelle demande

La route frontend `/distributeur/demandes/nouvelle` conserve d'abord le FDR uniquement dans React Hook Form.

Aucune ligne vide n'est créée à l'ouverture de l'écran. La demande est créée lorsque l'utilisateur confirme un FDR complet :

- `Demande` est créée avec le statut `BROUILLON` ;
- `FormulaireRisque` est créé dans la même transaction ;
- le backend revérifie la complétude fonctionnelle ;
- une erreur laisse la base inchangée.

### 4.2 Brouillon

En `BROUILLON`, le distributeur peut :

- modifier le FDR ;
- ajouter ou supprimer des justificatifs ;
- modifier le commentaire d'envoi ;
- supprimer entièrement la demande.

La suppression retire également les fichiers de pièces du stockage.

### 4.3 Envoi

L'envoi vérifie :

- la complétude de tous les champs FDR ;
- les cohérences croisées ;
- les pièces requises ;
- l'existence d'un unique compte `SIEGE`.

Si ces contrôles passent :

- un PDF FDR est généré ;
- `statut` devient `EN_COURS` ;
- `envoye_at` est renseigné ;
- une notification `DEMANDE_ENVOYEE` est créée pour le SIÈGE.

### 4.4 Traitement SIÈGE

Une demande `EN_COURS` et sans décision peut être :

- refusée ;
- faire l'objet d'une demande de compléments ;
- préparée pour la génération de l'attestation.

Le refus :

- renseigne `decision = REFUSEE` ;
- stocke `motif_refus` ;
- positionne `statut = TRAITE` ;
- crée une notification pour le distributeur.

La validation définitive d'attestation :

- génère un PDF final ;
- renseigne `validated_at` ;
- positionne `decision = ACCEPTEE` ;
- positionne `statut = TRAITE` ;
- notifie le distributeur.

## 5. FDR

Le formulaire regroupe cinq ensembles fonctionnels.

### Assuré

- nom ;
- ville ;
- numéro de contrat.

Le numéro de contrat doit contenir **exactement 13 chiffres** au niveau API et frontend.

### Chantier

- nom ;
- ville ;
- type : construction neuve ou rénovation ;
- modification de structure, demandée en rénovation ;
- caractère atypique.

### Usage et calendrier

- usage : habitation, bureau, commerce ou autre ;
- précision obligatoire si usage `AUTRE` ;
- date de début ;
- date de fin ;
- montant total.

La date de fin doit être strictement postérieure à la date de début.

### Intervention

- description ;
- montant de la prestation ;
- entreprise principale ou sous-traitant.

Le montant de la prestation doit être strictement inférieur au montant total du chantier.

### Questions métier

- activité couverte par le contrat ;
- explication obligatoire lorsque l'activité n'est pas couverte ;
- travaux standards ou non standards.

## 6. Détection automatique des pièces

Le backend est la source de vérité. Les règles sont cumulatives et évaluées dans l'ordre suivant :

| Catégorie technique | Condition |
| --- | --- |
| `structure` | rénovation **et** modification de structure = oui |
| `usage` | usage = `AUTRE` |
| `complexite` | chantier atypique = oui |
| `montant` | montant total > 10 000 000 |
| `activite` | activité couverte = non |
| `travaux` | travaux standards = non |

Une catégorie est considérée présente dès qu'au moins un justificatif du même `type_piece` existe.

L'API renvoie :

- `pieces` ;
- `pieces_requises` ;
- `pieces_manquantes` ;
- `dossier_complet`.

Les identifiants ci-dessus sont des catégories techniques, pas des noms de documents contractuels.

## 7. Évaluation automatique du risque

Le scoring est explicitement **fictif, déterministe et démonstratif**. Il ne représente ni un modèle actuariel ni une probabilité de sinistre.

| Facteur | Points |
| --- | ---: |
| Rénovation avec modification de structure | 20 |
| Usage `AUTRE` | 10 |
| Chantier atypique | 25 |
| Montant total > 10 M€ | 20 |
| Activité non couverte | 15 |
| Travaux non standards | 10 |

Niveaux :

- `< 25` : `faible` ;
- `25 à 49` : `modere` ;
- `>= 50` : `eleve`.

Le moteur de risque est volontairement séparé du moteur de pièces, même si les déclencheurs sont proches : une évolution de l'un ne doit pas modifier implicitement l'autre.

## 8. Justificatifs

Les fichiers acceptés sont :

- PDF ;
- JPG/JPEG ;
- PNG.

Le backend contrôle à la fois l'extension et le `content_type` reçu.

Le nom original est conservé comme métadonnée d'affichage, tandis que le chemin de stockage utilise un UUID opaque.

Les pièces ne sont ajoutables ou supprimables que lorsque la demande est `BROUILLON`.

## 9. Projet d'attestation distributeur

Pour une demande `EN_COURS`, le distributeur peut :

- créer le projet ;
- enregistrer le contenu HTML ;
- prévisualiser/télécharger son PDF.

Le contenu initial est construit à partir des données FDR. L'éditeur ne persiste que le corps HTML ; le gabarit institutionnel du document reste généré côté backend.

Le HTML accepté est limité aux balises : `p`, `br`, `strong`, `em`, `u`, `h1`, `h2`, `h3`, `ul`, `ol`, `li`, `blockquote`. Aucun attribut HTML n'est autorisé.

## 10. Préparation et validation SIÈGE

La préparation SIÈGE crée, si nécessaire, un objet `Attestation` prérempli à partir du FDR.

Le SIÈGE peut ensuite :

- charger l'attestation ;
- modifier le HTML ;
- générer une prévisualisation PDF ;
- analyser sa cohérence ;
- valider définitivement.

La validation n'est pas conditionnée par un résultat IA. Le contrôle de cohérence est une aide à la vérification ; la décision finale reste humaine.

## 11. Demande de compléments

Le SIÈGE peut créer un `DemandeComplement` avec message et notification au distributeur.

Une contrainte empêche plusieurs compléments actifs simultanés pour une même demande.

Limite actuelle : le code ne fournit pas encore de parcours permettant au distributeur de répondre formellement à cette demande, de réouvrir l'upload après envoi puis de renseigner `received_at`. Cette limite est détaillée dans [10 — Limites et évolutions](10-limites-evolutions.md).

## 12. Relance

Une demande `EN_COURS` peut être relancée par son distributeur.

- première relance : possible immédiatement ;
- relances suivantes : délai minimal de 24 h ;
- le destinataire est le compte `SIEGE` unique configuré ;
- l'envoi email doit réussir avant de persister `last_relance_at` et la notification ;
- un échec SMTP renvoie une erreur sans consommer le délai de relance.

## 13. Notifications

Types présents :

- `DEMANDE_ENVOYEE` ;
- `RELANCE` ;
- `COMPLEMENTS_DEMANDES` ;
- `DEMANDE_REFUSEE` ;
- `DEMANDE_ACCEPTEE`.

La liste des notifications ne marque rien automatiquement comme vu. Une action batch renseigne explicitement `seen_at` sur les identifiants affichés.

## 14. Reporting

Le reporting renvoie cinq compteurs :

- `total` ;
- `brouillons` ;
- `en_cours` ;
- `acceptees` ;
- `refusees`.

Pour un distributeur, seuls ses dossiers sont comptés et les brouillons sont inclus dans le total.

Pour le SIÈGE, les brouillons sont exclus du périmètre ; `brouillons` vaut donc zéro.
