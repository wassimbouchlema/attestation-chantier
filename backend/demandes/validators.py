import re
import unicodedata

from rest_framework import serializers

MESSAGE_NUMERO_CONTRAT = "Le numéro de contrat doit contenir exactement 13 chiffres."
MESSAGE_NOM = "Seuls les lettres, chiffres, espaces, apostrophes et tirets sont autorisés."

_NUMERO_CONTRAT = re.compile(r"[0-9]{13}")


def _caractere_autorise_nom(caractere: str) -> bool:
    return caractere in " '’-" or unicodedata.category(caractere)[0] in "LMN"


def valider_numero_contrat(valeur: str) -> None:
    if not _NUMERO_CONTRAT.fullmatch(valeur):
        raise serializers.ValidationError(MESSAGE_NUMERO_CONTRAT)


def valider_nom(valeur: str) -> None:
    if not all(_caractere_autorise_nom(caractere) for caractere in valeur):
        raise serializers.ValidationError(MESSAGE_NOM)
