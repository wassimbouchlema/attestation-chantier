"""Sanitization du contenu HTML éditable (projet d'attestation).

Whitelist explicite adaptée aux seules fonctionnalités de l'éditeur WYSIWYG
frontend (titres, gras, italique, souligné, listes, paragraphes) — jamais une
confiance dans une sanitization frontend seule, le backend reste l'unique
garde-fou avant persistance.
"""

import bleach

BALISES_AUTORISEES = [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "h1",
    "h2",
    "h3",
    "ul",
    "ol",
    "li",
    "blockquote",
]

ATTRIBUTS_AUTORISES: dict[str, list[str]] = {}


def nettoyer_html(html: str) -> str:
    return bleach.clean(
        html,
        tags=BALISES_AUTORISEES,
        attributes=ATTRIBUTS_AUTORISES,
        strip=True,
    )
