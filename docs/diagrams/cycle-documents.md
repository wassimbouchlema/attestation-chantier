# Diagramme — Cycle des documents

```mermaid
flowchart TB
    FDR[(FormulaireRisque)]

    SEND[Envoi de la demande]
    FDRPDF[PDF FDR\nSnapshot figé\nReportLab]

    PROJ_CREATE[Création explicite du projet\npar le distributeur]
    PROJ[ProjetAttestation\nHTML éditable]
    PROJPDF[PDF projet\nNON DÉFINITIF]

    SIEGE_PREP[Préparation SIÈGE]
    ATT[Attestation\nHTML éditable SIÈGE]
    PREVIEW[PDF de prévisualisation\nNON VALIDÉ]
    VALID[Validation humaine SIÈGE]
    FINAL[PDF définitif figé]

    FDR --> SEND
    SEND --> FDRPDF

    FDR --> PROJ_CREATE
    PROJ_CREATE --> PROJ
    PROJ --> PROJPDF

    FDR --> SIEGE_PREP
    SIEGE_PREP --> ATT
    ATT --> PREVIEW
    ATT --> VALID
    VALID --> FINAL

    PROJ -. document distinct,\nnon repris automatiquement .-> ATT
```

## Propriété importante

`ProjetAttestation` et `Attestation` sont indépendants. La préparation SIÈGE appelle le générateur de contenu initial à partir du FDR ; elle ne copie pas automatiquement le HTML du projet distributeur.
