# Diagramme — Architecture

```mermaid
flowchart TB
    U[Utilisateur DISTRIBUTEUR / SIÈGE]

    subgraph FE[Frontend SPA]
      SWA[React + TypeScript + Vite\nAzure Static Web Apps]
      RHF[React Hook Form + Zod]
      TQ[TanStack Query]
      Q[Quill]
    end

    GEO[geo.api.gouv.fr\nAutocomplétion des communes]

    subgraph BE[Backend Django / DRF]
      API[API REST + JWT]
      RULES[Règles FDR / pièces / risque]
      DOCS[Génération PDF\nReportLab + xhtml2pdf]
      SAN[Bleach\nSanitization HTML]
      AI[Contrôle de cohérence\nPydantic + règles déterministes]
      MAIL[Relance email]
    end

    PG[(PostgreSQL)]
    BLOB[(Stockage fichiers\nfilesystem local ou Azure Blob privé)]
    SMTP[Serveur SMTP]
    MISTRAL[Mistral API]

    U --> SWA
    SWA --> RHF
    SWA --> TQ
    SWA --> Q
    SWA -->|recherche ville| GEO
    TQ -->|HTTPS / JSON / multipart / PDF| API

    API --> RULES
    API --> DOCS
    API --> SAN
    API --> AI
    API --> MAIL
    API --> PG
    DOCS --> BLOB
    API --> BLOB
    AI -->|si backend=mistral| MISTRAL
    MAIL --> SMTP
```

## Notes

- Le navigateur appelle directement `geo.api.gouv.fr` pour l'autocomplétion des communes.
- Les fichiers métier ne sont pas exposés par un `MEDIA_URL` public.
- Le backend conserve la source de vérité pour les permissions, les transitions, les règles de pièces et la validation finale.
