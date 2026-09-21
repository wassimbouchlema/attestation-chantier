# Diagramme — Validation de l'attestation

```mermaid
sequenceDiagram
    actor S as Gestionnaire SIÈGE
    participant UI as Frontend
    participant API as Django / DRF
    participant DB as PostgreSQL
    participant ST as Stockage fichiers
    participant AI as Mistral ou simulation

    S->>UI: Ouvrir la préparation
    UI->>API: POST /siege/demandes/{id}/attestation/preparer/
    API->>DB: Vérifier EN_COURS et créer Attestation si absente
    API-->>UI: contenu_html

    S->>UI: Éditer puis enregistrer
    UI->>API: PATCH /siege/demandes/{id}/attestation/
    API->>API: Sanitization Bleach
    API->>DB: Sauvegarder contenu_html
    API-->>UI: Attestation sauvegardée

    opt Contrôle de cohérence
      S->>UI: Analyser avec IA
      UI->>API: POST .../attestation/analyser-coherence/
      API->>AI: FDR structuré + texte attestation
      AI-->>API: Résultat structuré
      API->>API: Validation Pydantic
      API-->>UI: anomalies / résumé
    end

    S->>UI: Valider et accepter
    UI->>API: POST .../attestation/valider/
    API->>DB: SELECT FOR UPDATE demande + attestation
    API->>API: Vérifier traitable / non validée / contenu non vide
    API->>ST: Générer et stocker PDF définitif
    API->>DB: validated_at + decision=ACCEPTEE + statut=TRAITE
    API->>DB: Créer notification DEMANDE_ACCEPTEE
    API-->>UI: Demande traitée
```

## Principe

Le résultat du contrôle IA n'est pas une précondition technique de `valider`. Le SIÈGE peut prendre sa décision indépendamment de l'analyse automatique.
