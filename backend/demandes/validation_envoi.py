"""Validation de complétude du FDR au moment de l'envoi au siège (POST /envoyer/).

Distincte de `FormulaireRisqueSerializer.validate()` : celle-ci autorise
volontairement un brouillon partiel (PATCH /fdr/). Cette fonction reprend
exactement la même définition de "FDR complet" déjà actée côté frontend (les
schémas Zod des 5 sections de l'étape Informations) — traduite en Python
natif, pas copiée mécaniquement depuis Zod. Aucune règle métier nouvelle,
aucune requête DB, aucun effet de bord : ne lit que l'instance `FormulaireRisque`
passée en argument.

Ne gère pas les pièces justificatives : `calculer_pieces_manquantes` (rules.py)
reste l'unique source de vérité pour cette partie, appelée séparément par la vue.
"""

from .models import FormulaireRisque, TypeChantier, Usage


def _vide(valeur: str | None) -> bool:
    """Une chaîne absente, vide, ou uniquement faite d'espaces est non renseignée."""
    return valeur is None or not valeur.strip()


def valider_fdr_pret_a_envoyer(fdr: FormulaireRisque) -> dict[str, str]:
    """Retourne un dict champ -> message d'erreur ; vide si le FDR est prêt à envoyer."""
    erreurs: dict[str, str] = {}

    # Assuré
    if _vide(fdr.assure_nom):
        erreurs["assure_nom"] = "Le nom de l'assuré est obligatoire."
    if _vide(fdr.assure_ville):
        erreurs["assure_ville"] = "La ville est obligatoire."
    if _vide(fdr.assure_numero_contrat):
        erreurs["assure_numero_contrat"] = "Le numéro de contrat est obligatoire."

    # Chantier
    if _vide(fdr.chantier_nom):
        erreurs["chantier_nom"] = "Le nom du chantier est obligatoire."
    if _vide(fdr.chantier_ville):
        erreurs["chantier_ville"] = "La ville du chantier est obligatoire."
    if not fdr.type_chantier:
        erreurs["type_chantier"] = "Le type de chantier est obligatoire."
    if fdr.type_chantier == TypeChantier.RENOVATION and fdr.modification_structure is None:
        erreurs["modification_structure"] = (
            "Merci d'indiquer si le chantier implique une modification de structure."
        )
    if fdr.chantier_atypique is None:
        erreurs["chantier_atypique"] = "Merci d'indiquer si le chantier est atypique."

    # Usage & calendrier
    if not fdr.usage:
        erreurs["usage"] = "L'usage est obligatoire."
    if fdr.usage == Usage.AUTRE and _vide(fdr.usage_autre_texte):
        erreurs["usage_autre_texte"] = 'Une précision est nécessaire lorsque l\'usage est "Autre".'
    if fdr.date_debut is None:
        erreurs["date_debut"] = "La date de début est obligatoire."
    if fdr.date_fin is None:
        erreurs["date_fin"] = "La date de fin est obligatoire."
    if fdr.montant_total is None:
        erreurs["montant_total"] = "Le montant total est obligatoire."

    # Intervention
    if _vide(fdr.intervention_description):
        erreurs["intervention_description"] = "La description de l'intervention est obligatoire."
    if fdr.intervention_montant_prestation is None:
        erreurs["intervention_montant_prestation"] = "Le montant de la prestation est obligatoire."
    if not fdr.intervention_type:
        erreurs["intervention_type"] = "Le type d'intervention est obligatoire."

    # Questions métier
    if fdr.activite_couverte is None:
        erreurs["activite_couverte"] = "Merci d'indiquer si l'activité est couverte par le contrat."
    if fdr.activite_couverte is False and _vide(fdr.activite_non_couverte_texte):
        erreurs["activite_non_couverte_texte"] = (
            "Une explication est nécessaire lorsque l'activité n'est pas couverte par le contrat."
        )
    if fdr.travaux_standards is None:
        erreurs["travaux_standards"] = "Merci d'indiquer si les travaux sont standards."

    # Cohérences croisées : uniquement si les deux champs concernés sont déjà
    # présents (sinon déjà signalés ci-dessus comme manquants — comparer une
    # valeur absente lèverait de toute façon une exception).
    if "date_fin" not in erreurs and "date_debut" not in erreurs and fdr.date_fin <= fdr.date_debut:
        erreurs["date_fin"] = "La date de fin doit être strictement postérieure à la date de début."

    if (
        "montant_total" not in erreurs
        and "intervention_montant_prestation" not in erreurs
        and fdr.intervention_montant_prestation >= fdr.montant_total
    ):
        erreurs["intervention_montant_prestation"] = (
            "Le montant de la prestation doit être strictement inférieur au montant total."
        )

    return erreurs
