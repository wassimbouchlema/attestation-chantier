from rest_framework import serializers

from ..models import DemandeComplement


class DemandeComplementSerializer(serializers.ModelSerializer):
    class Meta:
        model = DemandeComplement
        fields = ["id", "message", "requested_at", "received_at"]
        read_only_fields = fields


class DemanderComplementsSerializer(serializers.Serializer):
    message = serializers.CharField(trim_whitespace=True, allow_blank=False)


class RefuserDemandeSerializer(serializers.Serializer):
    motif = serializers.CharField(trim_whitespace=True, allow_blank=False)
