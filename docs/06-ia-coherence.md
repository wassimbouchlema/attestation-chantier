# 06 — IA et contrôle de cohérence

## 1. Rôle du contrôle

Le contrôle de cohérence compare :

- les données structurées du `FormulaireRisque` ;
- le texte de l'`Attestation` SIÈGE enregistrée.

Il vise à signaler des écarts factuels avant la validation définitive.

Il ne :

- décide pas de l'acceptation du risque ;
- ne modifie pas l'attestation ;
- ne crée pas de garantie ;
- ne produit pas d'avis juridique ;
- ne bloque pas la validation finale.

La décision appartient au SIÈGE.

## 2. Endpoint

```text
POST /api/siege/demandes/{id}/attestation/analyser-coherence/
```

Préconditions :

- rôle `SIEGE` ;
- demande encore traitable ;
- attestation existante ;
- attestation non validée.

En cas d'indisponibilité du moteur :

```json
{
  "code": "IA_INDISPONIBLE",
  "detail": "Le contrôle de cohérence est indisponible. Réessayez plus tard."
}
```

avec statut `503`.

## 3. Contrat de sortie

Le modèle `ResultatCoherence` est strict : les champs supplémentaires sont interdits.

```text
coherent: bool
resume: string
anomalies: AnomalieCoherence[]
```

Chaque anomalie contient :

```text
type
champ
valeur_fdr
valeur_attestation
message
```

Types :

- `VALEUR_DIFFERENTE`
- `INFORMATION_ABSENTE`
- `CONTRADICTION`

Invariant validé par Pydantic :

```text
coherent == (anomalies est vide)
```

## 4. Champs FDR adressables

`champ` ne peut prendre qu'un identifiant sémantique parmi les 19 champs FDR définis par `ChampFdr` :

- `assure_nom`
- `assure_ville`
- `assure_numero_contrat`
- `chantier_nom`
- `chantier_ville`
- `type_chantier`
- `chantier_atypique`
- `modification_structure`
- `usage`
- `usage_autre_texte`
- `date_debut`
- `date_fin`
- `montant_total`
- `intervention_description`
- `intervention_montant_prestation`
- `intervention_type`
- `activite_couverte`
- `activite_non_couverte_texte`
- `travaux_standards`

Le backend rejette également un résultat qui signalerait un champ non présent dans l'entrée réellement transmise.

## 5. Construction de l'entrée

Le backend :

1. sélectionne les champs FDR renseignés ;
2. ignore les sous-champs conditionnels lorsqu'ils ne s'appliquent pas ;
3. transforme les choix enum en libellés ;
4. sérialise dates et décimaux ;
5. nettoie le HTML de l'attestation ;
6. extrait uniquement son texte lisible ;
7. envoie au moteur un JSON contenant `fdr` et `attestation`.

Le HTML brut n'est donc pas envoyé tel quel au modèle.

## 6. Défense contre les instructions présentes dans les documents

Le prompt système précise que le FDR et l'attestation sont des **données non fiables** et que toute instruction qu'ils pourraient contenir doit être ignorée.

Le modèle reçoit également les consignes suivantes :

- comparer uniquement les faits présents ;
- ne pas inventer d'information ;
- ne pas recommander acceptation ou refus ;
- ne produire aucune prose hors du schéma demandé.

Il s'agit d'une mesure de réduction du risque de prompt injection documentaire, complétée par une sortie structurée et validée côté serveur.

## 7. Backend Mistral

Configuration :

```env
AI_COHERENCE_BACKEND=mistral
MISTRAL_API_KEY=...
MISTRAL_MODEL=mistral-medium-latest
```

L'appel utilise :

- `temperature=0` ;
- `response_format=ResultatCoherence` ;
- timeout de 30 secondes ;
- validation Pydantic après réception.

Toute exception du SDK est masquée derrière `IAIndisponible` afin de ne pas remonter au client des détails qui pourraient contenir des en-têtes ou du contenu documentaire.

## 8. Backend de simulation

Configuration :

```env
AI_COHERENCE_BACKEND=simulation
```

La simulation applique des extractions déterministes au texte de l'attestation et compare actuellement un sous-ensemble de champs :

- assuré ;
- numéro de contrat ;
- chantier ;
- dates ;
- montants ;
- type d'intervention.

Elle permet de démontrer le contrat UI/API sans dépendance réseau, mais elle n'a pas la couverture sémantique du backend Mistral.

## 9. Place dans la décision

Aucune condition dans `valider_attestation` n'exige :

- qu'une analyse ait été exécutée ;
- que `coherent` soit vrai ;
- qu'il n'existe aucune anomalie.

La validation finale vérifie les invariants techniques et métier de l'attestation puis laisse le SIÈGE prendre la décision.

## 10. Évolution : localisation contextuelle des incohérences

Une évolution possible serait d'associer chaque anomalie à la zone correspondante de l'éditeur afin de guider visuellement le gestionnaire vers l'information à vérifier.

Cette mise en évidence devrait rester :

- temporaire ;
- non persistée dans `contenu_html` ;
- absente des PDF.

La version actuelle ne l'implémente pas : le document éditable ne contient pas d'ancres sémantiques stables et tous les champs FDR ne sont pas nécessairement représentés explicitement. Un mapping textuel serait fragile.

Une future version pourrait introduire des ancres sémantiques contrôlées dans le modèle d'édition, puis s'appuyer sur une API de surlignage côté navigateur sans modifier le document sauvegardé.
