from django.contrib.auth.models import AbstractUser
from django.db import models


class Role(models.TextChoices):
    DISTRIBUTEUR = "DISTRIBUTEUR", "Distributeur"
    SIEGE = "SIEGE", "Siège"


class Utilisateur(AbstractUser):
    role = models.CharField(max_length=20, choices=Role.choices)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(role__in=Role.values),
                name="role_valide",
            ),
        ]
