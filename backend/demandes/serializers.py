from rest_framework import serializers

from .models import Demande


class DemandeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Demande
        fields = ["id", "distributeur", "statut", "created_at", "updated_at"]
        read_only_fields = fields
