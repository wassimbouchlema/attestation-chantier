import uuid
from pathlib import Path

from django.conf import settings
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models


class StatutDemande(models.TextChoices):
    BROUILLON = "BROUILLON", "Brouillon"
    EN_COURS = "EN_COURS", "En cours"
    TRAITE = "TRAITE", "Traité"


class DecisionDemande(models.TextChoices):
    ACCEPTEE = "ACCEPTEE", "Acceptée"
    REFUSEE = "REFUSEE", "Refusée"


def chemin_upload_fdr_pdf(instance, filename):
    # Même principe que `chemin_upload_piece` : chemin de stockage opaque,
    # seule l'extension du nom fourni est reprise.
    extension = Path(filename).suffix
    return f"fdr-pdf/{instance.id}/{uuid.uuid4()}{extension}"


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
    decision = models.CharField(max_length=20, choices=DecisionDemande.choices, null=True, blank=True)
    motif_refus = models.TextField(blank=True, default="")

    # Envoi au siège (Validation & envoi)
    commentaire_distributeur = models.TextField(blank=True, default="")
    envoye_at = models.DateTimeField(null=True, blank=True)
    fdr_pdf = models.FileField(upload_to=chemin_upload_fdr_pdf, null=True, blank=True)

    # Relance (demande déjà envoyée, EN_COURS) : pas de compteur pour cette version.
    last_relance_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(statut__in=StatutDemande.values),
                name="demande_statut_valide",
            ),
        ]


class DemandeComplement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    demande = models.ForeignKey(Demande, on_delete=models.CASCADE, related_name="complements")
    message = models.TextField()
    requested_at = models.DateTimeField(auto_now_add=True)
    received_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["demande"],
                condition=models.Q(received_at__isnull=True),
                name="demande_complement_actif_unique",
            ),
        ]


class TypeChantier(models.TextChoices):
    NEUVE = "NEUVE", "Construction neuve"
    RENOVATION = "RENOVATION", "Rénovation"


class Usage(models.TextChoices):
    HABITATION = "HABITATION", "Habitation"
    BUREAU = "BUREAU", "Bureau"
    COMMERCE = "COMMERCE", "Commerce"
    AUTRE = "AUTRE", "Autre"


class TypeIntervention(models.TextChoices):
    PRINCIPALE = "PRINCIPALE", "Entreprise principale"
    SOUS_TRAITANT = "SOUS_TRAITANT", "Sous-traitant"


numero_contrat_validator = RegexValidator(
    regex=r"^\d{1,13}$",
    message="Le numéro de contrat doit être uniquement numérique (13 chiffres maximum).",
)


class FormulaireRisque(models.Model):
    demande = models.OneToOneField(
        Demande,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="fdr",
    )

    # Assuré
    assure_nom = models.CharField(max_length=255, blank=True)
    assure_ville = models.CharField(max_length=255, blank=True)
    assure_numero_contrat = models.CharField(
        max_length=13, blank=True, validators=[numero_contrat_validator]
    )

    # Chantier
    chantier_nom = models.CharField(max_length=255, blank=True)
    chantier_ville = models.CharField(max_length=255, blank=True)
    type_chantier = models.CharField(
        max_length=20, choices=TypeChantier.choices, blank=True, default=""
    )
    modification_structure = models.BooleanField(null=True, blank=True)
    chantier_atypique = models.BooleanField(null=True, blank=True)

    # Usage
    usage = models.CharField(max_length=20, choices=Usage.choices, blank=True, default="")
    usage_autre_texte = models.TextField(blank=True)

    # Dates / coût
    date_debut = models.DateField(null=True, blank=True)
    date_fin = models.DateField(null=True, blank=True)
    montant_total = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
    )

    # Intervention
    intervention_description = models.TextField(blank=True)
    intervention_montant_prestation = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
    )
    intervention_type = models.CharField(
        max_length=20, choices=TypeIntervention.choices, blank=True, default=""
    )

    # Contrat / activité
    activite_couverte = models.BooleanField(null=True, blank=True)
    activite_non_couverte_texte = models.TextField(blank=True)

    # Travaux
    travaux_standards = models.BooleanField(null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(type_chantier__in=[*TypeChantier.values, ""]),
                name="fdr_type_chantier_valide",
            ),
            models.CheckConstraint(
                condition=models.Q(usage__in=[*Usage.values, ""]),
                name="fdr_usage_valide",
            ),
            models.CheckConstraint(
                condition=models.Q(intervention_type__in=[*TypeIntervention.values, ""]),
                name="fdr_intervention_type_valide",
            ),
        ]


def chemin_upload_piece(instance, filename):
    # Chemin de stockage opaque, indépendant du nom fourni par le client :
    # `filename` peut contenir des caractères/segments non fiables, seule son
    # extension (lue sur le dernier segment, jamais un chemin complet) est reprise.
    extension = Path(filename).suffix
    return f"pieces/{instance.demande_id}/{uuid.uuid4()}{extension}"


class PieceJustificative(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    demande = models.ForeignKey(Demande, on_delete=models.CASCADE, related_name="pieces")
    type_piece = models.CharField(max_length=20)
    fichier = models.FileField(upload_to=chemin_upload_piece)
    nom_fichier_original = models.CharField(max_length=255)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["uploaded_at", "id"]


class TypeNotification(models.TextChoices):
    DEMANDE_ENVOYEE = "DEMANDE_ENVOYEE", "Demande envoyée"
    RELANCE = "RELANCE", "Relance"
    COMPLEMENTS_DEMANDES = "COMPLEMENTS_DEMANDES", "Compléments demandés"
    DEMANDE_REFUSEE = "DEMANDE_REFUSEE", "Demande refusée"


class Notification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    destinataire = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    demande = models.ForeignKey(Demande, on_delete=models.CASCADE, related_name="notifications")
    type_notification = models.CharField(max_length=30, choices=TypeNotification.choices)
    titre = models.CharField(max_length=255)
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    # Sémantique "centre de notifications" (badge), pas "lue/non lue" : seen_at
    # null contribue au badge de non-vues, seen_at renseigné n'y contribue plus.
    # La notification reste toujours visible dans l'historique, jamais supprimée.
    seen_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(type_notification__in=TypeNotification.values),
                name="notification_type_valide",
            ),
        ]


class Attestation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    demande = models.OneToOneField(Demande, on_delete=models.CASCADE, related_name="attestation")
    contenu_html = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    pdf_final = models.FileField(upload_to="attestations/", null=True, blank=True)
    validated_at = models.DateTimeField(null=True, blank=True)


class ProjetAttestation(models.Model):
    """Document éditable (WYSIWYG) préparé par le distributeur pour une demande
    EN_COURS — jamais l'attestation définitive, qui reste du ressort du SIÈGE
    (hors périmètre de ce modèle pour l'instant). Aucune donnée FDR dupliquée
    en colonnes : `contenu_html` est le document complet, prérempli une seule
    fois à la création puis édité librement.
    """

    demande = models.OneToOneField(
        Demande,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="projet_attestation",
    )
    contenu_html = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
