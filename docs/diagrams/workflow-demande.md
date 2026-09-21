# Diagramme — Workflow d'une demande

```mermaid
stateDiagram-v2
    [*] --> NouvelleLocale: Nouvelle demande
    NouvelleLocale --> BROUILLON: Confirmer un FDR complet\nPOST /api/demandes/
    NouvelleLocale --> [*]: Abandon sans création

    BROUILLON --> BROUILLON: Modifier FDR / commentaire\nAjouter ou retirer des pièces
    BROUILLON --> [*]: Supprimer le brouillon
    BROUILLON --> EN_COURS: Envoyer\nFDR complet + pièces complètes\nPDF FDR figé

    EN_COURS --> EN_COURS: Relancer SIÈGE\n(min. 24 h entre relances)
    EN_COURS --> EN_COURS: Demander des compléments
    EN_COURS --> EN_COURS: Projet distributeur\nou préparation SIÈGE
    EN_COURS --> TRAITE_REFUSEE: Refuser + motif
    EN_COURS --> TRAITE_ACCEPTEE: Valider attestation\nPDF final figé

    TRAITE_REFUSEE --> [*]
    TRAITE_ACCEPTEE --> [*]
```

## États persistés

La base ne stocke que :

- `BROUILLON`
- `EN_COURS`
- `TRAITE`

Les deux états finaux du diagramme correspondent à :

```text
TRAITE + decision=REFUSEE
TRAITE + decision=ACCEPTEE
```
