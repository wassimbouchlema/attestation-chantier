from rest_framework.routers import SimpleRouter

from .views import DemandeViewSet

router = SimpleRouter(use_regex_path=False)
router.register("demandes", DemandeViewSet, basename="demande")

urlpatterns = router.urls
