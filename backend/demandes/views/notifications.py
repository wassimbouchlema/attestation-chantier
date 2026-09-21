from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import Notification
from ..schema_docs import TAG_NOTIFICATIONS
from ..serializers import MarquerNotificationsVuesSerializer, NotificationSerializer


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(destinataire=self.request.user)

    @extend_schema(
        tags=[TAG_NOTIFICATIONS],
        summary="Lister mes notifications",
        description=(
            "Tout utilisateur authentifié (DISTRIBUTEUR ou SIÈGE). Notifications de l'utilisateur connecté, "
            "sans pagination, avec `non_vues`, le nombre de notifications non lues."
        ),
        responses={
            200: inline_serializer(
                "NotificationsListe",
                {"non_vues": serializers.IntegerField(), "notifications": NotificationSerializer(many=True)},
            )
        },
    )
    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        non_vues = queryset.filter(seen_at__isnull=True).count()
        serializer = self.get_serializer(queryset, many=True)
        return Response({"non_vues": non_vues, "notifications": serializer.data})

    @extend_schema(
        tags=[TAG_NOTIFICATIONS],
        summary="Marquer des notifications comme vues",
        description=(
            "Tout utilisateur authentifié. Marque comme vues les notifications listées dans `ids`. "
            "Les identifiants inconnus, déjà vus ou appartenant à un autre utilisateur sont ignorés ; "
            "`marquees` indique le nombre effectivement mis à jour."
        ),
        request=MarquerNotificationsVuesSerializer,
        responses={
            200: inline_serializer("NotificationsMarquees", {"marquees": serializers.IntegerField()}),
            400: OpenApiResponse(description="`ids` absent ou contenant un UUID invalide."),
        },
    )
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
