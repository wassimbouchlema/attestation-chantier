from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    DemandeViewSet,
    NotificationViewSet,
    PieceJustificativeViewSet,
    SiegeDemandeViewSet,
    SiegePieceJustificativeViewSet,
)

router = SimpleRouter(use_regex_path=False)
router.register("demandes", DemandeViewSet, basename="demande")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("siege/demandes", SiegeDemandeViewSet, basename="siege-demande")

urlpatterns = router.urls + [
    path(
        "demandes/<uuid:demande_id>/pieces/",
        PieceJustificativeViewSet.as_view({"get": "list", "post": "create"}),
        name="piece-list",
    ),
    path(
        "demandes/<uuid:demande_id>/pieces/<uuid:pk>/",
        PieceJustificativeViewSet.as_view({"delete": "destroy"}),
        name="piece-detail",
    ),
    path(
        "siege/demandes/<uuid:demande_id>/pieces/<uuid:piece_id>/fichier/",
        SiegePieceJustificativeViewSet.as_view({"get": "fichier"}),
        name="siege-piece-fichier",
    ),
]
