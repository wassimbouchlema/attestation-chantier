"""Génération du contenu HTML initial d'un projet d'attestation à partir du
FDR d'une demande EN_COURS. Fonction Python pure (aucune requête DB, aucun
effet de bord) : le FDR est garanti complet à ce stade (`valider_fdr_pret_a_envoyer`
a déjà validé la demande au moment de l'envoi), pas de valeur de repli
"Non renseigné" nécessaire pour les champs obligatoires.

Périmètre strict : ce contenu est le **corps éditable** du document, et rien
d'autre. Tout ce qui relève du gabarit fixe (logo AXA, bloc agent, contrat et
références, date du courrier, objet, mentions « PROJET D'ATTESTATION — NON
DÉFINITIF » et « ATTESTATION D'ASSURANCE », pied de page de validation siège)
est rendu autour de cette zone par le gabarit — jamais dupliqué ici, sinon le
document afficherait deux fois les mêmes titres. Aucune donnée absente du FDR
n'est inventée (SIREN/SIRET, numéro client AXA, ORIAS, identité de l'agent...).

Pas de moteur de templates générique (Mustache/Handlebars...) : une simple
fonction de mise en forme suffit pour cette version, et reste plus simple à
faire évoluer/sanitizer que confier la structure du document au client.
"""

from django.utils.html import escape

from .models import FormulaireRisque, TypeChantier, TypeIntervention


def generer_contenu_initial(fdr: FormulaireRisque) -> str:
    type_chantier_libelle = TypeChantier(fdr.type_chantier).label
    type_intervention_libelle = TypeIntervention(fdr.intervention_type).label
    date_debut = fdr.date_debut.strftime("%d/%m/%Y") if fdr.date_debut else ""
    date_fin = fdr.date_fin.strftime("%d/%m/%Y") if fdr.date_fin else ""
    montant_total = f"{fdr.montant_total} €" if fdr.montant_total is not None else ""
    montant_prestation = (
        f"{fdr.intervention_montant_prestation} €"
        if fdr.intervention_montant_prestation is not None
        else ""
    )

    return (
        "<p>AXA France atteste, sous réserve de validation définitive par le "
        "siège, que :</p>"
        f"<p>{escape(fdr.assure_nom)}<br>{escape(fdr.assure_ville)}</p>"
        f"<p>est titulaire du contrat n° {escape(fdr.assure_numero_contrat)}.</p>"
        "<h2>CHANTIER</h2>"
        f"<p>{escape(fdr.chantier_nom)}<br>{escape(fdr.chantier_ville)}</p>"
        f"<p>Type de chantier : {escape(type_chantier_libelle)}</p>"
        f"<p>Période prévisionnelle des travaux : du {escape(date_debut)} au {escape(date_fin)}</p>"
        "<h2>NATURE DES TRAVAUX / INTERVENTION</h2>"
        f"<p>{escape(fdr.intervention_description)}</p>"
        f"<p>Type d'intervention : {escape(type_intervention_libelle)}</p>"
        f"<p>Montant total du chantier : {escape(montant_total)}</p>"
        f"<p>Montant de la prestation : {escape(montant_prestation)}</p>"
        "<blockquote>Projet établi à partir des informations déclarées dans "
        "le formulaire de risque.</blockquote>"
    )
