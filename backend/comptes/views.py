from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsDistributeur, IsSiege
from .serializers import UtilisateurSerializer


class Me(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UtilisateurSerializer(request.user).data)


class EspaceDistributeurTest(APIView):
    permission_classes = [IsDistributeur]

    def get(self, request):
        return Response({"message": "accès distributeur OK"})


class EspaceSiegeTest(APIView):
    permission_classes = [IsSiege]

    def get(self, request):
        return Response({"message": "accès siège OK"})
