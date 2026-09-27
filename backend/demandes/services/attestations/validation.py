import uuid

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone

from ...html_sanitization import nettoyer_html
from ...models import (
    Attestation,
    DecisionDemande,
    Demande,
    Notification,
    StatutDemande,
    TypeNotification,
)
from ...projet_attestation_pdf import generer_pdf
from ...rules import est_demande_traitable


class AttestationDejaValidee(Exception):
    pass


class DemandeNonTraitable(Exception):
    pass


class AttestationVide(Exception):
    pass


def valider_attestation(demande_id: uuid.UUID) -> Demande:
    nom_pdf = None
    stockage = Attestation._meta.get_field("pdf_final").storage
    try:
        with transaction.atomic():
            demande = (
                Demande.objects.select_for_update(of=("self",))
                .select_related("fdr", "distributeur")
                .get(pk=demande_id)
            )
            attestation = Attestation.objects.select_for_update().get(demande=demande)

            if attestation.validated_at is not None:
                raise AttestationDejaValidee

            if not est_demande_traitable(demande):
                raise DemandeNonTraitable

            contenu = nettoyer_html(attestation.contenu_html)
            if not contenu.strip():
                raise AttestationVide

            pdf = generer_pdf(demande, contenu, definitif=True)
            attestation.pdf_final.save(f"attestation-definitive-{demande.id}.pdf", ContentFile(pdf), save=False)
            nom_pdf = attestation.pdf_final.name
            attestation.validated_at = timezone.now()
            attestation.save(update_fields=["pdf_final", "validated_at", "updated_at"])
            demande.decision = DecisionDemande.ACCEPTEE
            demande.statut = StatutDemande.TRAITE
            demande.save(update_fields=["decision", "statut", "updated_at"])
            Notification.objects.create(
                destinataire=demande.distributeur,
                demande=demande,
                type_notification=TypeNotification.DEMANDE_ACCEPTEE,
                titre="Demande acceptée",
                message="Votre demande a été acceptée. L'attestation définitive est disponible.",
            )
            return demande
    except Exception:
        if nom_pdf:
            stockage.delete(nom_pdf)
        raise
