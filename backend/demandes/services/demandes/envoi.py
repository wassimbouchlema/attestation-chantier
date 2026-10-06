import uuid

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone

from comptes.models import Utilisateur
from comptes.services import obtenir_compte_siege_unique

from ...models import Demande, Notification, StatutDemande, TypeNotification
from ...pdf import generer_pdf_fdr
from ...rules import calculer_pieces_manquantes, calculer_pieces_requises, est_demande_modifiable
from ...validation_envoi import valider_fdr_pret_a_envoyer

TITRE_DEMANDE_ENVOYEE = "Nouvelle demande reçue"
MESSAGE_DEMANDE_ENVOYEE = "Une nouvelle demande d'attestation de chantier a été envoyée."


class DemandeNonModifiable(Exception):
    pass


class FdrInvalide(Exception):
    def __init__(self, erreurs: dict[str, str]):
        self.erreurs = erreurs


class DossierIncomplet(Exception):
    def __init__(self, pieces_manquantes: list[str]):
        self.pieces_manquantes = pieces_manquantes


def envoyer_demande(
    demande_id: uuid.UUID,
    distributeur: Utilisateur,
    *,
    commentaire_distributeur: str | None,
) -> Demande:
    with transaction.atomic():
        demande = Demande.objects.select_for_update().filter(distributeur=distributeur).get(pk=demande_id)

        if not est_demande_modifiable(demande):
            raise DemandeNonModifiable

        erreurs_fdr = valider_fdr_pret_a_envoyer(demande.fdr)
        if erreurs_fdr:
            raise FdrInvalide(erreurs_fdr)

        pieces_requises = calculer_pieces_requises(demande.fdr)
        pieces_presentes = {piece.type_piece for piece in demande.pieces.all()}
        pieces_manquantes = calculer_pieces_manquantes(pieces_requises, pieces_presentes)
        if pieces_manquantes:
            raise DossierIncomplet(pieces_manquantes)

        siege = obtenir_compte_siege_unique()

        if commentaire_distributeur is not None:
            demande.commentaire_distributeur = commentaire_distributeur
        commentaire_final = demande.commentaire_distributeur

        envoye_at = timezone.now()
        pdf_bytes = generer_pdf_fdr(demande, envoye_at=envoye_at, commentaire_distributeur=commentaire_final)

        try:
            demande.fdr_pdf.save(f"{demande.id}.pdf", ContentFile(pdf_bytes), save=False)
            demande.statut = StatutDemande.EN_COURS
            demande.envoye_at = envoye_at
            demande.save()
            Notification.objects.create(
                destinataire=siege,
                demande=demande,
                type_notification=TypeNotification.DEMANDE_ENVOYEE,
                titre=TITRE_DEMANDE_ENVOYEE,
                message=MESSAGE_DEMANDE_ENVOYEE,
            )
        except Exception:
            if demande.fdr_pdf:
                demande.fdr_pdf.delete(save=False)
            raise

    return demande
