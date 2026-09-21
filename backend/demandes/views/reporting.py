from django.db.models import Count, Q
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from comptes.models import Role

from ..models import DecisionDemande, Demande, StatutDemande
from ..schema_docs import TAG_REPORTING


class ReportingView(APIView):
    """Compteurs des demandes du distributeur (brouillons inclus dans le total), ou des demandes transmises au siège."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=[TAG_REPORTING],
        summary="Synthèse des demandes",
        description=(
            "Compteurs de demandes par statut ou décision. DISTRIBUTEUR : ses propres demandes, brouillons inclus. "
            "SIÈGE : toutes les demandes envoyées (brouillons exclus). Les demandes acceptées ou refusées "
            "sont celles au statut TRAITE avec la décision correspondante."
        ),
        responses={
            200: inline_serializer(
                "Reporting",
                {
                    "total": serializers.IntegerField(),
                    "brouillons": serializers.IntegerField(),
                    "en_cours": serializers.IntegerField(),
                    "acceptees": serializers.IntegerField(),
                    "refusees": serializers.IntegerField(),
                },
            )
        },
    )
    def get(self, request):
        if request.user.role == Role.SIEGE:
            demandes = Demande.objects.exclude(statut=StatutDemande.BROUILLON)
        else:
            demandes = Demande.objects.filter(distributeur=request.user)

        compteurs = demandes.aggregate(
            total=Count("pk"),
            brouillons=Count("pk", filter=Q(statut=StatutDemande.BROUILLON)),
            en_cours=Count("pk", filter=Q(statut=StatutDemande.EN_COURS)),
            acceptees=Count(
                "pk", filter=Q(statut=StatutDemande.TRAITE, decision=DecisionDemande.ACCEPTEE)
            ),
            refusees=Count(
                "pk", filter=Q(statut=StatutDemande.TRAITE, decision=DecisionDemande.REFUSEE)
            ),
        )
        return Response(compteurs)
