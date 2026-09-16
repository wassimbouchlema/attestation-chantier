from django.db import transaction
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from comptes.permissions import IsDistributeur

from .models import Demande, FormulaireRisque, StatutDemande
from .serializers import DemandeDetailSerializer, DemandeSerializer, FormulaireRisqueSerializer


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

    def get_serializer_class(self):
        if self.action == "retrieve":
            return DemandeDetailSerializer
        if self.action == "fdr":
            return FormulaireRisqueSerializer
        return DemandeSerializer

    def perform_create(self, serializer):
        with transaction.atomic():
            demande = serializer.save(
                distributeur=self.request.user,
                statut=StatutDemande.BROUILLON,
            )
            FormulaireRisque.objects.create(demande=demande)

    @action(detail=True, methods=["get", "patch"], url_path="fdr")
    def fdr(self, request, pk=None):
        demande = self.get_object()

        if request.method == "GET":
            serializer = self.get_serializer(demande.fdr)
            return Response(serializer.data)

        if demande.statut != StatutDemande.BROUILLON:
            return Response(
                {"detail": "Cette demande n'est plus modifiable (statut différent de BROUILLON)."},
                status=status.HTTP_409_CONFLICT,
            )

        serializer = self.get_serializer(demande.fdr, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
