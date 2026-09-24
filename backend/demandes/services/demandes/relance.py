import uuid

from django.core.mail import EmailMessage
from django.db import transaction
from django.utils import timezone

from comptes.models import Utilisateur
from comptes.services import obtenir_compte_siege_unique

from ...models import Demande, Notification, StatutDemande, TypeNotification
from ...rules import prochaine_relance_autorisee_at

TITRE_RELANCE = "Demande relancée"
MESSAGE_RELANCE = "Le distributeur a relancé une demande en cours de traitement."


class RelanceNonAutorisee(Exception):
    pass


class DelaiRelanceNonEcoule(Exception):
    def __init__(self, prochaine_relance_at):
        self.prochaine_relance_at = prochaine_relance_at


class EmailSiegeIndisponible(Exception):
    pass


class EnvoiEmailRelanceEchoue(Exception):
    pass


def relancer_demande(demande_id: uuid.UUID, distributeur: Utilisateur) -> Demande:
    with transaction.atomic():
        demande = Demande.objects.select_for_update().filter(distributeur=distributeur).get(pk=demande_id)

        if demande.statut != StatutDemande.EN_COURS:
            raise RelanceNonAutorisee

        maintenant = timezone.now()
        prochaine_relance_at = prochaine_relance_autorisee_at(demande)
        if prochaine_relance_at is not None and maintenant < prochaine_relance_at:
            raise DelaiRelanceNonEcoule(prochaine_relance_at)

        siege = obtenir_compte_siege_unique()

        if not siege.email:
            raise EmailSiegeIndisponible

        distributeur_affiche = distributeur.get_full_name() or distributeur.get_username()
        corps = (
            "Bonjour,\n\n"
            f"Le distributeur {distributeur_affiche} vous relance concernant "
            f"la demande d'attestation {demande.id}, actuellement en cours de traitement.\n\n"
            "Merci de consulter la demande dans l'application.\n\n"
            "Cordialement,\n"
            "Attestation de chantier"
        )

        try:
            EmailMessage(
                subject="[Attestation de chantier] Relance d'une demande en cours",
                body=corps,
                to=[siege.email],
            ).send(fail_silently=False)
        except Exception as exc:
            transaction.set_rollback(True)
            raise EnvoiEmailRelanceEchoue from exc

        demande.last_relance_at = maintenant
        demande.save(update_fields=["last_relance_at"])
        Notification.objects.create(
            destinataire=siege,
            demande=demande,
            type_notification=TypeNotification.RELANCE,
            titre=TITRE_RELANCE,
            message=MESSAGE_RELANCE,
        )

    return demande
