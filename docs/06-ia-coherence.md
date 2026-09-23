# 06 — Contrôle de cohérence FDR / attestation

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

Le moteur étant déterministe et local (aucun appel réseau), il n'existe plus de cas d'indisponibilité du contrôle lui-même : seules les préconditions ci-dessus peuvent produire une erreur (`404`, `409`).

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
- `CONTRADICTION` (défini par le schéma, jamais produit par le moteur actuel — voir §6)

Invariant validé par Pydantic :

```text
coherent == (anomalies est vide)
```

## 4. Champs comparés

`champ` ne peut prendre qu'un identifiant sémantique parmi les 12 champs FDR définis par `ChampFdr` — ceux que `generer_contenu_initial()` écrit réellement dans le corps de l'attestation :

- `assure_nom`
- `assure_ville`
- `assure_numero_contrat`
- `chantier_nom`
- `chantier_ville`
- `type_chantier`
- `date_debut`
- `date_fin`
- `montant_total`
- `intervention_description`
- `intervention_montant_prestation`
- `intervention_type`

Les questions métier tri-state (`chantier_atypique`, `modification_structure`, `activite_couverte`, `travaux_standards`, `usage`, `usage_autre_texte`, `activite_non_couverte_texte`) ne font pas partie de `ChampFdr` : elles ne sont jamais rendues dans l'attestation, les comparer produirait systématiquement `INFORMATION_ABSENTE`.

Sur ces 12 champs, **11 sont effectivement comparés** par le moteur. `intervention_description` est volontairement exclu de la comparaison : sa localisation dans le texte est déterministe (délimitée par deux repères fixes), mais c'est un champ de prose libre multi-lignes — une comparaison d'égalité stricte transformerait toute reformulation légitime du SIÈGE en fausse anomalie `VALEUR_DIFFERENTE`.

## 5. Construction de l'entrée

Le backend :

1. sélectionne les champs FDR renseignés ;
2. transforme les choix enum en libellés (`type_chantier`, `intervention_type`) ;
3. sérialise dates et décimaux ;
4. nettoie le HTML de l'attestation (`bleach`) ;
5. extrait uniquement son texte lisible ;
6. construit un dict Python `{"fdr": ..., "attestation": ...}` transmis directement, en mémoire, au moteur — aucune sérialisation JSON, aucun appel réseau.

## 6. Le moteur par règles (`_analyser_par_regles`)

Pour chacun des 11 champs comparés, le moteur :

1. recherche dans le texte de l'attestation un motif ancré sur le repère textuel fixe que produit `generer_contenu_initial()` (ex. « Montant total du chantier : », le titre `CHANTIER`) ;
2. normalise la valeur trouvée et la valeur FDR avant comparaison ;
3. compare les deux valeurs normalisées.

Normalisations utilisées :

- **texte** (noms, villes, libellés d'enum) : suppression des accents, mise en minuscule, espaces multiples réduits à un seul, ponctuation finale ignorée ;
- **date** : conversion du format `jj/mm/aaaa` trouvé dans le texte vers le format ISO `aaaa-mm-jj` du FDR ;
- **montant** : suppression des espaces (y compris insécables), virgule convertie en point décimal, comparaison via `Decimal`.

Résultat : `VALEUR_DIFFERENTE` si le motif est trouvé mais diffère après normalisation, `INFORMATION_ABSENTE` si le motif n'est pas trouvé du tout.

Deux paires de champs (`assure_nom`/`assure_ville`, `chantier_nom`/`chantier_ville`) se distinguent par position plutôt que par libellé propre. Leurs motifs exigent la présence des deux lignes **et** du repère qui suit : si l'une des deux lignes est absente (ex. suppression manuelle dans l'éditeur), les deux champs de la paire échouent ensemble en `INFORMATION_ABSENTE`, plutôt que d'attribuer une ligne au mauvais champ.

## 7. Pourquoi une approche déterministe

- **Reproductibilité** : une même paire FDR/attestation produit toujours le même résultat, ce qui n'était pas garanti avec un modèle de langage (observé notamment sur des valeurs strictement identiques signalées à tort comme différentes).
- **Aucune dépendance externe** ni latence réseau pour une fonctionnalité de contrôle interne.
- **Testabilité** : chaque règle est une expression régulière et une fonction de normalisation, vérifiables unitairement de façon exhaustive.

## 8. Ce qui a été retiré

La cohérence FDR/attestation n'utilise plus :

- le setting `AI_COHERENCE_BACKEND` ;
- le setting `MISTRAL_MODEL` ;
- l'appel `client.chat.parse()` ;
- un prompt système destiné à un LLM ;
- tout mécanisme de fallback entre plusieurs moteurs.

`MISTRAL_API_KEY` et `MISTRAL_DOCUMENT_MODEL` restent nécessaires, mais pour une fonctionnalité distincte : l'extraction de document / préremplissage FDR (`MistralExtracteurFdr`), qui continue d'utiliser l'OCR Mistral pour transformer un document externe non structuré en données structurées — un besoin different de la comparaison FDR/attestation, où les deux côtés sont déjà connus du backend.

## 9. Place dans la décision

Aucune condition dans `valider_attestation` n'exige :

- qu'une analyse ait été exécutée ;
- que `coherent` soit vrai ;
- qu'il n'existe aucune anomalie.

La validation finale vérifie les invariants techniques et métier de l'attestation puis laisse le SIÈGE prendre la décision.

## 10. Évolution de l'architecture

Une approche par LLM (Mistral) a été expérimentée pour cette fonctionnalité avant d'être remplacée par le moteur par règles actuel, afin d'obtenir des résultats reproductibles sur une comparaison où les deux côtés (FDR structuré, texte généré par un gabarit fixe) sont déjà connus du backend.

## 11. Évolution possible : localisation contextuelle des incohérences

Une évolution possible serait d'associer chaque anomalie à la zone correspondante de l'éditeur afin de guider visuellement le gestionnaire vers l'information à vérifier.

Cette mise en évidence devrait rester :

- temporaire ;
- non persistée dans `contenu_html` ;
- absente des PDF.

La version actuelle ne l'implémente pas : le document éditable ne contient pas d'ancres sémantiques stables et tous les champs FDR ne sont pas nécessairement représentés explicitement. Un mapping textuel serait fragile.

Une future version pourrait introduire des ancres sémantiques contrôlées dans le modèle d'édition, puis s'appuyer sur une API de surlignage côté navigateur sans modifier le document sauvegardé.
