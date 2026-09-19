from rest_framework import serializers

from ..html_sanitization import nettoyer_html
from ..models import Attestation
from .demandes import DemandeDetailSerializer


class SiegeDemandeDetailSerializer(DemandeDetailSerializer):
    attestation_existe = serializers.SerializerMethodField()

    class Meta(DemandeDetailSerializer.Meta):
        fields = DemandeDetailSerializer.Meta.fields + ["attestation_existe"]
        read_only_fields = fields

    def get_attestation_existe(self, demande):
        return hasattr(demande, "attestation")


class AttestationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attestation
        fields = ["id", "demande", "contenu_html", "created_at", "updated_at", "pdf_final", "validated_at"]
        read_only_fields = ["id", "demande", "created_at", "updated_at", "pdf_final", "validated_at"]

    def validate_contenu_html(self, value):
        return nettoyer_html(value)
