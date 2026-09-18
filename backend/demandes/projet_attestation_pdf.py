"""Rendu PDF du projet d'attestation : HTML complet (gabarit fixe + corps
éditable sanitizé) -> xhtml2pdf.

Moteur distinct de celui du FDR, assumé : le FDR est un document structuré
composé directement en ReportLab et figé à l'envoi, alors que le projet
d'attestation part d'un HTML WYSIWYG qu'il faut mettre en page. xhtml2pdf
suffit ici car le HTML éditable est volontairement limité (titres,
paragraphes, gras/italique/souligné, listes) : aucun moteur CSS de navigateur
n'est nécessaire.

Le PDF n'est jamais stocké : il est rendu à la demande à partir de
`contenu_html`, seule source de vérité. Le corps repris ici est celui
enregistré en base, donc déjà passé par `nettoyer_html()` — jamais l'état
temporaire de l'éditeur côté navigateur.
"""

import io
from datetime import date
from pathlib import Path

from django.utils.html import escape

from .models import Demande

CHEMIN_LOGO = Path(__file__).resolve().parent / "assets" / "logo-axa.svg"


def chemin_logo_axa() -> str:
    return CHEMIN_LOGO.as_posix()


FEUILLE_STYLE = """
@page { size: a4; margin: 1.6cm 1.8cm; }
body { font-family: Helvetica; font-size: 10pt; color: #333333; }
.label { font-size: 7pt; color: #666666; text-transform: uppercase; }
.entete { margin-bottom: 18pt; }
.bloc { font-size: 9pt; }
.objet { border-bottom: 0.5pt solid #cccccc; padding-bottom: 10pt; margin-bottom: 16pt; }
.titre-projet { font-size: 15pt; font-weight: bold; text-align: center; }
.mention { font-size: 10pt; font-weight: bold; text-align: center; color: #bd4d2e; }
.titre-objet { font-size: 11pt; font-weight: bold; text-align: center; margin-top: 14pt; }
.corps { margin-top: 16pt; }
.pied { border-top: 0.5pt solid #cccccc; padding-top: 8pt; margin-top: 20pt;
        font-size: 8pt; color: #666666; }
h2 { font-size: 10.5pt; }
blockquote { font-style: italic; color: #333333; margin-left: 12pt; }
"""


def _nom_agent(demande: Demande) -> str:
    agent = demande.distributeur
    nom_complet = f"{agent.first_name} {agent.last_name}".strip()
    return nom_complet or agent.username


def construire_html(demande: Demande, contenu_html: str) -> str:
    fdr = demande.fdr
    return f"""<html>
<head><meta charset="utf-8" /><style>{FEUILLE_STYLE}</style></head>
<body>
  <table class="entete" width="100%"><tr>
    <td width="70%">
      <p class="label">Votre agent général</p>
      <p>{escape(_nom_agent(demande))}</p>
    </td>
    <td width="30%" align="right">
      <img src="{chemin_logo_axa()}" width="52" height="52" />
    </td>
  </tr></table>

  <table class="bloc" width="100%"><tr>
    <td width="50%" valign="top">
      <p class="label">Votre contrat</p>
      <p>Attestation de chantier</p>
      <p class="label">Vos références</p>
      <p>Contrat n° {escape(fdr.assure_numero_contrat)}</p>
    </td>
    <td width="50%" valign="top">
      <p class="label">Assuré</p>
      <p>{escape(fdr.assure_nom)}</p>
      <p>{escape(fdr.assure_ville)}</p>
      <p class="label">Date du courrier</p>
      <p>{date.today().strftime("%d/%m/%Y")}</p>
    </td>
  </tr></table>

  <div class="objet">
    <p class="label">Objet</p>
    <p>Attestation d'assurance — Chantier {escape(fdr.chantier_nom)}</p>
  </div>

  <p class="titre-projet">PROJET D'ATTESTATION</p>
  <p class="mention">NON DÉFINITIF</p>
  <p class="titre-objet">ATTESTATION D'ASSURANCE</p>

  <div class="corps">{contenu_html}</div>

  <p class="pied">Validation définitive : réservée au siège.</p>
</body></html>"""


def generer_pdf(demande: Demande, contenu_html: str) -> bytes:
    from xhtml2pdf import pisa

    sortie = io.BytesIO()
    resultat = pisa.CreatePDF(src=construire_html(demande, contenu_html), dest=sortie, encoding="utf-8")
    if resultat.err:
        raise RuntimeError("Échec de la génération du PDF du projet d'attestation.")
    return sortie.getvalue()
