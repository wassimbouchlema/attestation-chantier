from rest_framework import serializers

from ..html_sanitization import nettoyer_html
from ..models import ProjetAttestation


class ProjetAttestationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjetAttestation
        fields = ["contenu_html", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]

    def validate_contenu_html(self, value):
        # Le backend reste le garde-fou même si le frontend nettoie aussi le HTML.
        return nettoyer_html(value)
