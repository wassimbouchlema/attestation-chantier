from rest_framework import serializers

from ..models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    demande_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "type_notification", "titre", "message", "demande_id", "created_at", "seen_at"]
        read_only_fields = fields


class MarquerNotificationsVuesSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=True)
