from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import DemandeViewSet, PieceJustificativeViewSet

router = SimpleRouter(use_regex_path=False)
router.register("demandes", DemandeViewSet, basename="demande")

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
]
