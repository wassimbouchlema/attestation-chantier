"""Abstraction du service d'extraction de données FDR depuis un document."""

from dataclasses import dataclass
from typing import Protocol, get_args, runtime_checkable

from django.conf import settings

from .extraction_fdr import ChampExtractibleFdr, ResultatExtractionFdr


@dataclass(frozen=True)
class DocumentAExtraire:
    """Contenu + type MIME seulement, pas de registre de formats : PDF est
    le seul format réellement supporté pour l'instant. `nom_fichier` est
    indicatif (logs/audit), jamais utilisé pour décider du format.
    """

    contenu: bytes
    type_mime: str
    nom_fichier: str = ""


@runtime_checkable
class ExtracteurDocumentFdr(Protocol):
    """Une implémentation ne doit jamais écrire en base ni créer de `Demande` :
    elle transforme un document en `ResultatExtractionFdr`, à charge de
    l'appelant (future vue DRF) d'en faire un préremplissage formulaire.
    """

    def extraire(self, document: DocumentAExtraire) -> ResultatExtractionFdr: ...


class ExtractionDocumentIndisponible(Exception):
    """Comme `IAIndisponible` (analyse_coherence.py) : masquera plus tard, à
    la couche HTTP, les erreurs techniques du fournisseur IA (réseau, quota,
    réponse invalide...).
    """


def _resultat_vide() -> ResultatExtractionFdr:
    # Résultat sûr par défaut : aucune valeur inventée.
    return ResultatExtractionFdr(champs_non_trouves=list(get_args(ChampExtractibleFdr)))


class FakeExtracteurFdr:
    """Déterministe, sans réseau ni accès base — pour les tests des couches futures."""

    def __init__(self, resultat: ResultatExtractionFdr | None = None):
        self._resultat = resultat if resultat is not None else _resultat_vide()

    def extraire(self, document: DocumentAExtraire) -> ResultatExtractionFdr:
        return self._resultat


def obtenir_extracteur_fdr() -> ExtracteurDocumentFdr:
    # Échoue explicitement plutôt que de basculer silencieusement sur le
    # fake : une mauvaise configuration ne doit jamais donner un résultat
    # d'extraction trompeur.
    backend = settings.DOCUMENT_EXTRACTION_BACKEND
    if backend == "fake":
        return FakeExtracteurFdr()
    if backend == "mistral":
        raise NotImplementedError(
            "Le backend d'extraction de document 'mistral' n'est pas encore implémenté."
        )
    raise ValueError(f"Backend d'extraction de document inconnu : {backend!r}")
