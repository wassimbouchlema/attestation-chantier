"""Contrat de résultat d'extraction de données FDR à partir d'un document.

Aucun appel IA, aucun endpoint, aucune écriture en base : ce résultat sert
uniquement à préremplir le formulaire React (`FdrFormValues`), jamais à
créer/modifier une `Demande`/`FormulaireRisque` directement.

Champs volontairement exclus de `ChampExtractibleFdr` : les 4 booléens
tri-state de `FormulaireRisque` (`modification_structure`, `chantier_atypique`,
`activite_couverte`, `travaux_standards`) exigent une interprétation ou une
déduction plutôt qu'une simple lecture. `activite_non_couverte_texte`, qui ne
prend sens qu'en réponse à `activite_couverte`, est exclu pour la même raison.

`ResultatExtractionFdr` impose qu'un champ extractible soit *explicitement*
renseigné ou *explicitement* listé dans `champs_non_trouves` (jamais les
deux, jamais aucun des deux) : une extraction qui « oublierait »
silencieusement un champ est rejetée par la validation Pydantic plutôt que
de laisser une ambiguïté entre « non cherché » et « cherché, absent ».
"""

from datetime import date
from decimal import Decimal
from typing import Annotated, Generic, Literal, TypeVar, get_args

from pydantic import BaseModel, ConfigDict, Field, WithJsonSchema, model_validator

from .models import TypeChantier, TypeIntervention, Usage

ChampExtractibleFdr = Literal[
    "assure_nom",
    "assure_ville",
    "assure_numero_contrat",
    "chantier_nom",
    "chantier_ville",
    "type_chantier",
    "usage",
    "usage_autre_texte",
    "date_debut",
    "date_fin",
    "montant_total",
    "intervention_description",
    "intervention_montant_prestation",
    "intervention_type",
]


T = TypeVar("T")


class ValeurExtraite(BaseModel, Generic[T]):
    """`page`/`extrait_source` restent optionnels : un document sans
    pagination fiable (image unique, par exemple) peut n'en fournir aucun.
    """

    model_config = ConfigDict(extra="forbid", strict=True)

    valeur: T
    confiance: float = Field(ge=0.0, le=1.0)
    page: int | None = Field(default=None, ge=1)
    extrait_source: str | None = Field(default=None, min_length=1, max_length=300)

    @model_validator(mode="after")
    def verifier_valeur_texte_non_vide(self):
        if isinstance(self.valeur, str) and self.valeur.strip() == "":
            raise ValueError(
                "Une valeur trouvée ne peut pas être une chaîne vide : utiliser champs_non_trouves."
            )
        return self


ChampExtraitTexte = ValeurExtraite[str]
ChampExtraitDate = ValeurExtraite[date]

# Le schéma JSON par défaut de Decimal (`anyOf[number, string au format
# décimal]`) est rejeté par Mistral OCR (document_annotation_format, erreur
# 3700 "Invalid structured output syntax") : forcer `{"type": "number"}`
# côté schéma seulement, la validation Python continue de produire un
# `Decimal` normalement.
Montant = Annotated[Decimal, WithJsonSchema({"type": "number"})]
ChampExtraitMontant = ValeurExtraite[Montant]
ChampExtraitTypeChantier = ValeurExtraite[Literal[TypeChantier.NEUVE, TypeChantier.RENOVATION]]
ChampExtraitUsage = ValeurExtraite[
    Literal[Usage.HABITATION, Usage.BUREAU, Usage.COMMERCE, Usage.AUTRE]
]
ChampExtraitTypeIntervention = ValeurExtraite[
    Literal[TypeIntervention.PRINCIPALE, TypeIntervention.SOUS_TRAITANT]
]


class ResultatExtractionFdr(BaseModel):
    """Chaque champ FDR est optionnel individuellement, mais
    `verifier_exhaustivite` interdit qu'il reste `None` sans apparaître dans
    `champs_non_trouves` : le résultat doit se prononcer sur chaque champ.
    """

    model_config = ConfigDict(extra="forbid", strict=True)

    assure_nom: ChampExtraitTexte | None = None
    assure_ville: ChampExtraitTexte | None = None
    assure_numero_contrat: ChampExtraitTexte | None = None
    chantier_nom: ChampExtraitTexte | None = None
    chantier_ville: ChampExtraitTexte | None = None
    type_chantier: ChampExtraitTypeChantier | None = None
    usage: ChampExtraitUsage | None = None
    usage_autre_texte: ChampExtraitTexte | None = None
    date_debut: ChampExtraitDate | None = None
    date_fin: ChampExtraitDate | None = None
    montant_total: ChampExtraitMontant | None = None
    intervention_description: ChampExtraitTexte | None = None
    intervention_montant_prestation: ChampExtraitMontant | None = None
    intervention_type: ChampExtraitTypeIntervention | None = None

    champs_non_trouves: list[ChampExtractibleFdr] = Field(default_factory=list, max_length=len(get_args(ChampExtractibleFdr)))

    @model_validator(mode="after")
    def verifier_exhaustivite(self):
        if len(set(self.champs_non_trouves)) != len(self.champs_non_trouves):
            raise ValueError("champs_non_trouves contient des doublons.")
        for champ in get_args(ChampExtractibleFdr):
            valeur_presente = getattr(self, champ) is not None
            non_trouve = champ in self.champs_non_trouves
            if valeur_presente and non_trouve:
                raise ValueError(
                    f"Le champ '{champ}' ne peut pas être à la fois renseigné et listé dans champs_non_trouves."
                )
            if not valeur_presente and not non_trouve:
                raise ValueError(
                    f"Le champ '{champ}' doit être renseigné ou listé dans champs_non_trouves."
                )
        return self
