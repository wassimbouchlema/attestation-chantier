"""Éléments partagés de documentation OpenAPI (drf-spectacular).

Uniquement de la description de schéma : aucun de ces objets n'est utilisé à l'exécution
par les vues (validation, permissions ou sérialisation des réponses).
"""

from drf_spectacular.utils import inline_serializer
from rest_framework import serializers

from .serializers import PieceJustificativeSerializer

TAG_DEMANDES = "Demandes"
TAG_FDR = "Formulaire FDR"
TAG_PIECES = "Pièces justificatives"
TAG_RISQUE = "Évaluation du risque"
TAG_ATTESTATION = "Attestation"
TAG_SIEGE = "Traitement SIÈGE"
TAG_NOTIFICATIONS = "Notifications"
TAG_REPORTING = "Reporting"

DEMANDE_INTROUVABLE = "Demande introuvable (ou n'appartenant pas à l'utilisateur)."
DEMANDE_NON_MODIFIABLE = "Demande n'étant plus au statut BROUILLON."
DEMANDE_NON_TRAITABLE = "DEMANDE_NON_TRAITABLE : la demande n'est plus EN_COURS ou a déjà une décision."

PiecesDossierSerializer = inline_serializer(
    name="PiecesDossier",
    fields={
        "pieces": PieceJustificativeSerializer(many=True),
        "pieces_requises": serializers.ListField(child=serializers.CharField()),
        "pieces_manquantes": serializers.ListField(child=serializers.CharField()),
        "dossier_complet": serializers.BooleanField(),
    },
)
