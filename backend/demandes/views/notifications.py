from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import Notification
from ..serializers import MarquerNotificationsVuesSerializer, NotificationSerializer


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(destinataire=self.request.user)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        non_vues = queryset.filter(seen_at__isnull=True).count()
        serializer = self.get_serializer(queryset, many=True)
        return Response({"non_vues": non_vues, "notifications": serializer.data})

    @action(detail=False, methods=["post"], url_path="marquer-vues")
    def marquer_vues(self, request):
        entree = MarquerNotificationsVuesSerializer(data=request.data)
        entree.is_valid(raise_exception=True)

        # Seule cette action marque les notifications du demandeur comme vues.
        nombre_marquees = Notification.objects.filter(
            destinataire=request.user,
            id__in=entree.validated_data["ids"],
            seen_at__isnull=True,
        ).update(seen_at=timezone.now())

        return Response({"marquees": nombre_marquees}, status=status.HTTP_200_OK)
