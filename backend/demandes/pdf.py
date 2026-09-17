"""Génération du PDF FDR — snapshot figé du dossier au moment de l'envoi au siège.

Généré UNE SEULE FOIS (`generer_pdf_fdr`), lors de `POST /envoyer/`, jamais
régénéré au téléchargement. Représente les déclarations du distributeur :
aucun score/niveau/synthèse d'évaluation automatique du risque (information
interne à l'application, pas une déclaration du distributeur).

`envoye_at`/`commentaire_distributeur` sont passés en paramètres explicites
(jamais relus depuis `demande` en base) : au moment de la génération, la
transaction n'a pas encore persisté l'envoi, donc `demande.envoye_at`/
`demande.statut` ne doivent jamais être utilisés directement ici — c'est aussi
pourquoi le statut n'est volontairement pas affiché dans le document.
"""

from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas as reportlab_canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import Demande, FormulaireRisque, TypeChantier, TypeIntervention, Usage
from .rules import (
    PIECE_ACTIVITE,
    PIECE_COMPLEXITE,
    PIECE_MONTANT,
    PIECE_STRUCTURE,
    PIECE_TRAVAUX,
    PIECE_USAGE,
)

COULEUR_TITRE = colors.HexColor("#00008F")
COULEUR_FILET = colors.HexColor("#00008F")
COULEUR_PIED_DE_PAGE = colors.HexColor("#666666")

# Mapping métier lisible dédié au PDF (jamais les identifiants techniques
# structure/usage/complexite/montant/activite/travaux) — même texte que
# `LIBELLE_CATEGORIE_PIECE` côté frontend, pour rester cohérent.
LIBELLE_CATEGORIE_PIECE_PDF = {
    PIECE_STRUCTURE: "Justificatif lié à la modification de structure",
    PIECE_USAGE: "Justificatif lié à l'usage du chantier",
    PIECE_COMPLEXITE: "Justificatif lié au caractère atypique du chantier",
    PIECE_MONTANT: "Justificatif lié au montant du chantier",
    PIECE_ACTIVITE: "Justificatif lié à l'activité hors contrat",
    PIECE_TRAVAUX: "Justificatif lié aux travaux non standards",
}


def _libelle_oui_non(valeur: bool | None) -> str:
    if valeur is True:
        return "Oui"
    if valeur is False:
        return "Non"
    return "Non renseigné"


def _formater_date(valeur) -> str:
    if valeur is None:
        return "Non renseigné"
    return valeur.strftime("%d/%m/%Y")


def _formater_montant(valeur) -> str:
    if valeur is None:
        return "Non renseigné"
    entier, _, decimales = f"{valeur:.2f}".partition(".")
    signe = ""
    if entier.startswith("-"):
        signe = "-"
        entier = entier[1:]
    groupes = []
    while len(entier) > 3:
        groupes.insert(0, entier[-3:])
        entier = entier[:-3]
    groupes.insert(0, entier)
    return f"{signe}{' '.join(groupes)},{decimales} €"


def _echapper(texte: str) -> str:
    return escape(texte or "")


def _styles():
    base = getSampleStyleSheet()
    return {
        "titre": ParagraphStyle(
            "TitreFdr", parent=base["Title"], textColor=COULEUR_TITRE, fontSize=16, spaceAfter=2,
        ),
        "sous_titre": ParagraphStyle(
            "SousTitreFdr", parent=base["Normal"], fontSize=11, textColor=colors.black, spaceAfter=10,
        ),
        "section": ParagraphStyle(
            "SectionFdr",
            parent=base["Heading2"],
            textColor=COULEUR_TITRE,
            fontSize=12,
            spaceBefore=14,
            spaceAfter=6,
        ),
        "corps": ParagraphStyle("CorpsFdr", parent=base["Normal"], fontSize=9.5, leading=13),
        "meta": ParagraphStyle("MetaFdr", parent=base["Normal"], fontSize=9.5, leading=13),
    }


def _table_champs(lignes, styles):
    """Table label/valeur à 2 colonnes, valeurs en Paragraph pour le retour à la ligne automatique."""
    donnees = [[Paragraph(_echapper(label), styles["corps"]), Paragraph(_echapper(valeur), styles["corps"])] for label, valeur in lignes]
    table = Table(donnees, colWidths=[5.5 * cm, 10.5 * cm])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#DDDDDD")),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ]
        )
    )
    return table


def _section_assure(fdr: FormulaireRisque, styles):
    return [
        Paragraph("1. ASSURÉ", styles["section"]),
        _table_champs(
            [
                ("Nom / raison sociale", fdr.assure_nom),
                ("Ville", fdr.assure_ville),
                ("Numéro de contrat", fdr.assure_numero_contrat),
            ],
            styles,
        ),
    ]


def _section_chantier(fdr: FormulaireRisque, styles):
    lignes = [
        ("Nom du chantier", fdr.chantier_nom),
        ("Ville", fdr.chantier_ville),
        ("Type de chantier", TypeChantier(fdr.type_chantier).label if fdr.type_chantier else "Non renseigné"),
    ]
    if fdr.type_chantier == TypeChantier.RENOVATION:
        lignes.append(("Modification de structure", _libelle_oui_non(fdr.modification_structure)))
    lignes.append(("Chantier atypique", _libelle_oui_non(fdr.chantier_atypique)))
    return [Paragraph("2. CHANTIER", styles["section"]), _table_champs(lignes, styles)]


def _section_usage(fdr: FormulaireRisque, styles):
    usage_label = Usage(fdr.usage).label if fdr.usage else "Non renseigné"
    if fdr.usage == Usage.AUTRE and fdr.usage_autre_texte:
        usage_label = f"{usage_label} — {fdr.usage_autre_texte}"
    lignes = [
        ("Usage", usage_label),
        ("Date de début", _formater_date(fdr.date_debut)),
        ("Date de fin", _formater_date(fdr.date_fin)),
        ("Montant total", _formater_montant(fdr.montant_total)),
    ]
    return [Paragraph("3. USAGE &amp; CALENDRIER", styles["section"]), _table_champs(lignes, styles)]


def _section_intervention(fdr: FormulaireRisque, styles):
    lignes = [
        ("Description", fdr.intervention_description),
        ("Montant de la prestation", _formater_montant(fdr.intervention_montant_prestation)),
        (
            "Type d'intervention",
            TypeIntervention(fdr.intervention_type).label if fdr.intervention_type else "Non renseigné",
        ),
    ]
    return [Paragraph("4. INTERVENTION", styles["section"]), _table_champs(lignes, styles)]


def _section_questions_metier(fdr: FormulaireRisque, styles):
    activite_label = _libelle_oui_non(fdr.activite_couverte)
    if fdr.activite_couverte is False and fdr.activite_non_couverte_texte:
        activite_label = f"{activite_label} — {fdr.activite_non_couverte_texte}"
    lignes = [
        ("Activité couverte par le contrat", activite_label),
        ("Travaux standards", _libelle_oui_non(fdr.travaux_standards)),
    ]
    return [Paragraph("5. QUESTIONS MÉTIER", styles["section"]), _table_champs(lignes, styles)]


def _section_pieces(demande: Demande, styles):
    pieces = list(demande.pieces.all())
    elements = [Paragraph("6. PIÈCES JUSTIFICATIVES TRANSMISES", styles["section"])]
    if not pieces:
        elements.append(
            Paragraph("Aucune pièce justificative n'était requise pour cette demande.", styles["corps"])
        )
        return elements

    donnees = [
        [Paragraph("Catégorie", styles["corps"]), Paragraph("Fichier", styles["corps"]), Paragraph("Date d'envoi", styles["corps"])]
    ]
    for piece in pieces:
        donnees.append(
            [
                Paragraph(_echapper(LIBELLE_CATEGORIE_PIECE_PDF.get(piece.type_piece, piece.type_piece)), styles["corps"]),
                Paragraph(_echapper(piece.nom_fichier_original), styles["corps"]),
                Paragraph(_formater_date(piece.uploaded_at.date()), styles["corps"]),
            ]
        )
    table = Table(donnees, colWidths=[7 * cm, 6 * cm, 3 * cm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#DDDDDD")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F0F0F5")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    elements.append(table)
    return elements


def _section_commentaire(commentaire_distributeur: str, styles):
    if not commentaire_distributeur or not commentaire_distributeur.strip():
        return []
    return [
        Paragraph("COMMENTAIRE DU DISTRIBUTEUR", styles["section"]),
        Paragraph(_echapper(commentaire_distributeur).replace("\n", "<br/>"), styles["corps"]),
    ]


class _CanvasAvecPiedDePage(reportlab_canvas.Canvas):
    """Canvas standard reportlab pour numéroter "Page X / Y" : le nombre total
    de pages n'est connu qu'une fois toutes les pages construites, donc chaque
    page est mise en mémoire (`showPage` différé) puis le pied de page réel est
    dessiné pour toutes les pages seulement dans `save()`.
    """

    def __init__(self, *args, **kwargs):
        self._reference = kwargs.pop("reference", "")
        self._horodatage = kwargs.pop("horodatage", "")
        super().__init__(*args, **kwargs)
        self._pages_en_attente = []

    def showPage(self):
        self._pages_en_attente.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        nombre_pages = len(self._pages_en_attente)
        for etat in self._pages_en_attente:
            self.__dict__.update(etat)
            self._dessiner_pied_de_page(nombre_pages)
            super().showPage()
        super().save()

    def _dessiner_pied_de_page(self, nombre_pages):
        self.saveState()
        self.setFont("Helvetica", 7.5)
        self.setFillColor(COULEUR_PIED_DE_PAGE)
        largeur_page, _ = A4
        y = 1.2 * cm
        self.drawString(
            2 * cm,
            y,
            f"Référence : {self._reference} — Document généré lors de l'envoi au siège le {self._horodatage}",
        )
        self.drawRightString(largeur_page - 2 * cm, y, f"Page {self.getPageNumber()} / {nombre_pages}")
        self.restoreState()


def generer_pdf_fdr(demande: Demande, *, envoye_at, commentaire_distributeur: str) -> bytes:
    """Construit le PDF FDR entièrement en mémoire et retourne ses octets bruts.

    `envoye_at`/`commentaire_distributeur` sont les valeurs finales retenues
    par la vue d'envoi (un seul `timezone.now()`, commentaire déjà résolu),
    jamais relues depuis `demande` (pas encore persistée à ce stade).
    """
    styles = _styles()
    tampon = BytesIO()

    reference = str(demande.id)
    date_envoi = _formater_date(envoye_at.date())
    horodatage = envoye_at.strftime("%d/%m/%Y à %H:%M")

    doc = SimpleDocTemplate(
        tampon,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2.2 * cm,
        title=f"FDR-{reference}",
        # Compression désactivée : ce PDF est un document figé de référence, pas
        # un fichier optimisé pour la bande passante — priorité à un flux dont le
        # contenu texte reste inspectable (tests, débogage) plutôt qu'au poids.
        pageCompression=0,
    )

    elements = [
        Paragraph("FORMULAIRE DE DÉCLARATION DU RISQUE", styles["titre"]),
        Paragraph("Demande d'attestation de chantier", styles["sous_titre"]),
        _table_champs(
            [("Référence", reference), ("Date d'envoi", date_envoi)],
            styles,
        ),
        Spacer(1, 0.4 * cm),
    ]

    fdr = demande.fdr
    elements += _section_assure(fdr, styles)
    elements += _section_chantier(fdr, styles)
    elements += _section_usage(fdr, styles)
    elements += _section_intervention(fdr, styles)
    elements += _section_questions_metier(fdr, styles)
    elements += _section_pieces(demande, styles)
    elements += _section_commentaire(commentaire_distributeur, styles)

    def _canvasmaker(*args, **kwargs):
        return _CanvasAvecPiedDePage(*args, reference=reference, horodatage=horodatage, **kwargs)

    doc.build(elements, canvasmaker=_canvasmaker)
    return tampon.getvalue()
