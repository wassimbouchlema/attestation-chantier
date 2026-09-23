import re
import unicodedata
from datetime import date
from decimal import Decimal
from html.parser import HTMLParser
from typing import Literal, get_args

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .html_sanitization import nettoyer_html
from .models import Attestation, FormulaireRisque


# Périmètre limité aux champs que generer_contenu_initial() écrit réellement
# dans l'attestation (projet_attestation.py) : les questions métier tri-state
# (chantier_atypique, modification_structure, activite_couverte,
# travaux_standards), leurs textes de précision et usage/usage_autre_texte n'y
# apparaissent jamais, quelle que soit leur valeur — les comparer produirait
# systématiquement INFORMATION_ABSENTE.
ChampFdr = Literal[
    "assure_nom", "assure_ville", "assure_numero_contrat", "chantier_nom",
    "chantier_ville", "type_chantier", "date_debut", "date_fin", "montant_total",
    "intervention_description", "intervention_montant_prestation", "intervention_type",
]


class AnomalieCoherence(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    type: Literal["VALEUR_DIFFERENTE", "INFORMATION_ABSENTE", "CONTRADICTION"]
    champ: ChampFdr
    valeur_fdr: str = Field(max_length=4000)
    valeur_attestation: str = Field(max_length=4000)
    message: str = Field(min_length=1, max_length=1000)


class ResultatCoherence(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    coherent: bool
    resume: str = Field(min_length=1, max_length=1000)
    anomalies: list[AnomalieCoherence] = Field(max_length=50)

    @model_validator(mode="after")
    def verifier_coherence(self):
        if self.coherent != (not self.anomalies):
            raise ValueError("Le résultat et les anomalies sont contradictoires.")
        return self


class _TexteAttestation(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.fragments = []

    def handle_data(self, data):
        self.fragments.append(data)

    def handle_starttag(self, tag, attrs):
        if tag in {"p", "br", "h1", "h2", "h3", "li", "blockquote"}:
            self.fragments.append("\n")

    def handle_endtag(self, tag):
        if tag in {"p", "h1", "h2", "h3", "li", "blockquote"}:
            self.fragments.append("\n")


def construire_entree(fdr: FormulaireRisque, attestation: Attestation) -> dict:
    donnees = {}
    for champ in get_args(ChampFdr):
        valeur = getattr(fdr, champ)
        if valeur is None or valeur == "":
            continue
        if isinstance(valeur, (date, Decimal)):
            valeur = str(valeur)
        elif champ in {"type_chantier", "intervention_type"}:
            valeur = getattr(fdr, f"get_{champ}_display")()
        donnees[champ] = valeur
    texte = _TexteAttestation()
    texte.feed(nettoyer_html(attestation.contenu_html))
    lignes = (" ".join(ligne.split()) for ligne in "".join(texte.fragments).splitlines())
    return {"fdr": donnees, "attestation": "\n".join(ligne for ligne in lignes if ligne)}


def _analyser_par_regles(entree: dict) -> ResultatCoherence:
    anomalies = []
    texte = entree["attestation"]
    regles = {
        # assure_nom/assure_ville et chantier_nom/chantier_ville se distinguent
        # par position (ligne 1/ligne 2), pas par libellé : chaque motif exige
        # les deux lignes ET le repère suivant, pour échouer ensemble plutôt
        # que d'attribuer une ligne au mauvais champ si l'une des deux manque.
        "assure_nom": (r"que\s*:\s*\n([^\n]+)\n[^\n]+\nest titulaire du contrat", _normaliser_texte, "Le nom de l'assuré"),
        "assure_ville": (r"que\s*:\s*\n[^\n]+\n([^\n]+)\nest titulaire du contrat", _normaliser_texte, "La ville de l'assuré"),
        "assure_numero_contrat": (r"contrat\s+n[°o]\s*([^\n.]+)", _normaliser_texte, "Le numéro de contrat"),
        "chantier_nom": (r"\nCHANTIER\s*\n([^\n]+)\n[^\n]+\nType de chantier", _normaliser_texte, "Le nom du chantier"),
        "chantier_ville": (r"\nCHANTIER\s*\n[^\n]+\n([^\n]+)\nType de chantier", _normaliser_texte, "La ville du chantier"),
        "type_chantier": (r"Type de chantier\s*:\s*([^\n]+)", _normaliser_texte, "Le type de chantier"),
        "date_debut": (r"Période prévisionnelle des travaux\s*:\s*du\s+(\d{2}/\d{2}/\d{4})", _normaliser_date, "La date de début"),
        "date_fin": (r"Période prévisionnelle des travaux[^\n]*\sau\s+(\d{2}/\d{2}/\d{4})", _normaliser_date, "La date de fin"),
        "montant_total": (r"Montant total du chantier\s*:\s*([^\n€]+)", _normaliser_montant, "Le montant total du chantier"),
        "intervention_montant_prestation": (r"Montant de la prestation\s*:\s*([^\n€]+)", _normaliser_montant, "Le montant de la prestation"),
        "intervention_type": (r"Type d'intervention\s*:\s*([^\n]+)", _normaliser_texte, "Le type d'intervention"),
    }
    for champ, (motif, normaliser, libelle) in regles.items():
        if champ not in entree["fdr"]:
            continue
        attendu = str(entree["fdr"][champ])
        trouve = re.search(motif, texte, re.IGNORECASE)
        valeur = trouve.group(1).strip() if trouve else ""
        if not trouve or normaliser(valeur) != normaliser(attendu):
            anomalies.append(AnomalieCoherence(
                type="VALEUR_DIFFERENTE" if trouve else "INFORMATION_ABSENTE",
                champ=champ, valeur_fdr=attendu, valeur_attestation=valeur,
                message=f"{libelle} diffère." if trouve else f"{libelle} n'a pas été retrouvé dans l'attestation.",
            ))
    return ResultatCoherence(
        coherent=not anomalies,
        resume=(
            "Aucune incohérence détectée entre le FDR et l'attestation enregistrée."
            if not anomalies
            else f"{len(anomalies)} incohérence{'s' if len(anomalies) > 1 else ''} détectée{'s' if len(anomalies) > 1 else ''}."
        ),
        anomalies=anomalies,
    )


def _normaliser_texte(valeur: str) -> str:
    sans_accents = "".join(
        caractere for caractere in unicodedata.normalize("NFKD", valeur)
        if not unicodedata.combining(caractere)
    )
    return " ".join(sans_accents.casefold().split()).strip(" .")


def _normaliser_date(valeur: str) -> str:
    if re.fullmatch(r"\d{2}/\d{2}/\d{4}", valeur):
        return "-".join(reversed(valeur.split("/")))
    return valeur


def _normaliser_montant(valeur: str) -> str:
    try:
        return str(Decimal(re.sub(r"\s", "", valeur).replace(",", ".")))
    except ArithmeticError:
        return valeur


def analyser_coherence(fdr: FormulaireRisque, attestation: Attestation) -> ResultatCoherence:
    return _analyser_par_regles(construire_entree(fdr, attestation))
