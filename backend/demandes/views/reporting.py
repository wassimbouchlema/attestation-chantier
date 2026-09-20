from django.db.models import Count, Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from comptes.models import Role

from ..models import DecisionDemande, Demande, StatutDemande


class ReportingView(APIView):
    """Compteurs des demandes du distributeur (brouillons inclus dans le total), ou des demandes transmises au siège."""

    permission_classes = [IsAuthenticated]

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
