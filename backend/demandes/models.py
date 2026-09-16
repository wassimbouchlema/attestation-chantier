import uuid

from django.conf import settings
from django.db import models


class StatutDemande(models.TextChoices):
    BROUILLON = "BROUILLON", "Brouillon"
    EN_COURS = "EN_COURS", "En cours"
    TRAITE = "TRAITE", "Traité"


class Demande(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    distributeur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="demandes",
    )
    statut = models.CharField(
        max_length=20,
        choices=StatutDemande.choices,
        default=StatutDemande.BROUILLON,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(statut__in=StatutDemande.values),
                name="demande_statut_valide",
            ),
        ]
