from pathlib import Path

from rest_framework import serializers

from ..models import PieceJustificative
from ..rules import TYPES_PIECES_AUTORISES

EXTENSIONS_PIECES_AUTORISEES = {".pdf", ".jpg", ".jpeg", ".png"}
CONTENT_TYPES_PIECES_AUTORISES = {"application/pdf", "image/jpeg", "image/png"}


class PieceJustificativeSerializer(serializers.ModelSerializer):
    type_piece = serializers.ChoiceField(choices=TYPES_PIECES_AUTORISES)

    class Meta:
        model = PieceJustificative
        fields = ["id", "type_piece", "fichier", "nom_fichier_original", "uploaded_at"]
        read_only_fields = ["id", "nom_fichier_original", "uploaded_at"]
        extra_kwargs = {"fichier": {"write_only": True}}

    def validate_fichier(self, fichier):
        extension = Path(fichier.name).suffix.lower()
        if extension not in EXTENSIONS_PIECES_AUTORISEES or (
            fichier.content_type not in CONTENT_TYPES_PIECES_AUTORISES
        ):
            raise serializers.ValidationError(
                "Type de fichier non autorisé (formats acceptés : PDF, JPG, PNG)."
            )
        return fichier

    def create(self, validated_data):
        # Le nom d'affichage reste distinct du chemin de stockage opaque.
        validated_data["nom_fichier_original"] = Path(validated_data["fichier"].name).name
        return super().create(validated_data)
