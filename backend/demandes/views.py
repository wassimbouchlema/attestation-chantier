from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from comptes.permissions import IsDistributeur

from .evaluation_risque import calculer_evaluation_risque
from .models import Demande, FormulaireRisque, PieceJustificative, StatutDemande
from .rules import calculer_pieces_manquantes, calculer_pieces_requises
from .serializers import (
    DemandeDetailSerializer,
    DemandeSerializer,
    EvaluationRisqueSerializer,
    FormulaireRisqueSerializer,
    PieceJustificativeSerializer,
)


class DemandePagination(PageNumberPagination):
    page_size = 10


class DemandeViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsDistributeur]
    serializer_class = DemandeSerializer
    lookup_value_converter = "uuid"
    pagination_class = DemandePagination

    def get_queryset(self):
        queryset = Demande.objects.filter(distributeur=self.request.user)

        if self.action == "list":
            statut = self.request.query_params.get("statut")
            if statut:
                if statut not in StatutDemande.values:
                    raise ValidationError(
                        {
                            "statut": (
                                "Valeur invalide. Valeurs autorisées : "
                                f"{', '.join(StatutDemande.values)}."
                            )
                        }
                    )
                queryset = queryset.filter(statut=statut)

        return queryset

    def get_serializer_class(self):
        if self.action == "retrieve":
            return DemandeDetailSerializer
        if self.action == "fdr":
            return FormulaireRisqueSerializer
        if self.action == "evaluation_risque":
            return EvaluationRisqueSerializer
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

    @action(detail=True, methods=["get"], url_path="evaluation-risque")
    def evaluation_risque(self, request, pk=None):
        demande = self.get_object()
        serializer = self.get_serializer(calculer_evaluation_risque(demande.fdr))
        return Response(serializer.data)


class PieceJustificativeViewSet(viewsets.GenericViewSet):
    permission_classes = [IsDistributeur]
    serializer_class = PieceJustificativeSerializer

    def _get_demande(self):
        return get_object_or_404(
            Demande.objects.filter(distributeur=self.request.user),
            pk=self.kwargs["demande_id"],
        )

    def _refuser_hors_brouillon(self, demande):
        if demande.statut != StatutDemande.BROUILLON:
            return Response(
                {"detail": "Cette demande n'est plus modifiable (statut différent de BROUILLON)."},
                status=status.HTTP_409_CONFLICT,
            )
        return None

    def list(self, request, *args, **kwargs):
        demande = self._get_demande()
        pieces = PieceJustificative.objects.filter(demande=demande)
        pieces_requises = calculer_pieces_requises(demande.fdr)
        pieces_presentes = {piece.type_piece for piece in pieces}
        pieces_manquantes = calculer_pieces_manquantes(pieces_requises, pieces_presentes)

        return Response(
            {
                "pieces": self.get_serializer(pieces, many=True).data,
                "pieces_requises": pieces_requises,
                "pieces_manquantes": pieces_manquantes,
                "dossier_complet": not pieces_manquantes,
            }
        )

    def create(self, request, *args, **kwargs):
        demande = self._get_demande()
        conflit = self._refuser_hors_brouillon(demande)
        if conflit is not None:
            return conflit

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(demande=demande)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        demande = self._get_demande()
        conflit = self._refuser_hors_brouillon(demande)
        if conflit is not None:
            return conflit

        piece = get_object_or_404(PieceJustificative, pk=kwargs["pk"], demande=demande)
        piece.fichier.delete(save=False)
        piece.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
