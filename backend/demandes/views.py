from rest_framework import mixins, viewsets

from comptes.permissions import IsDistributeur

from .models import Demande, StatutDemande
from .serializers import DemandeSerializer


class DemandeViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsDistributeur]
    serializer_class = DemandeSerializer
    lookup_value_converter = "uuid"

    def get_queryset(self):
        return Demande.objects.filter(distributeur=self.request.user)

    def perform_create(self, serializer):
        serializer.save(
            distributeur=self.request.user,
            statut=StatutDemande.BROUILLON,
        )
