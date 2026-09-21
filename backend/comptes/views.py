from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .permissions import IsDistributeur, IsSiege
from .serializers import UtilisateurSerializer

TAG_AUTH = "Authentification"


@extend_schema_view(
    post=extend_schema(
        tags=[TAG_AUTH],
        summary="Se connecter",
        description=(
            "Authentifie un utilisateur (DISTRIBUTEUR ou SIÈGE) par `username` et `password` et retourne un jeton "
            "d'accès (`access`) et un jeton de rafraîchissement (`refresh`). Le jeton d'accès s'envoie dans "
            "l'en-tête `Authorization: Bearer <access>`."
        ),
        responses={
            200: OpenApiResponse(description="Jetons `access` et `refresh`."),
            401: OpenApiResponse(description="Identifiants invalides."),
        },
    )
)
class LoginView(TokenObtainPairView):
    pass


@extend_schema_view(
    post=extend_schema(
        tags=[TAG_AUTH],
        summary="Rafraîchir le jeton d'accès",
        description="Retourne un nouveau jeton d'accès à partir d'un jeton `refresh` valide.",
        responses={
            200: OpenApiResponse(description="Nouveau jeton `access`."),
            401: OpenApiResponse(description="Jeton de rafraîchissement invalide ou expiré."),
        },
    )
)
class RefreshView(TokenRefreshView):
    pass


class Me(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UtilisateurSerializer

    @extend_schema(
        tags=[TAG_AUTH],
        summary="Utilisateur connecté",
        description="Retourne l'identité et le rôle (`role` : DISTRIBUTEUR ou SIEGE) de l'utilisateur authentifié.",
        responses={200: UtilisateurSerializer},
    )
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
