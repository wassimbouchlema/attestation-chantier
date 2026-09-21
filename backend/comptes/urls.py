from django.conf import settings
from django.urls import path

from .views import EspaceDistributeurTest, EspaceSiegeTest, LoginView, Me, RefreshView

urlpatterns = [
    path("auth/login/", LoginView.as_view(), name="token_obtain_pair"),
    path("auth/refresh/", RefreshView.as_view(), name="token_refresh"),
    path("auth/me/", Me.as_view(), name="me"),
]

dev_urlpatterns = [
    path("test/distributeur/", EspaceDistributeurTest.as_view(), name="test_distributeur"),
    path("test/siege/", EspaceSiegeTest.as_view(), name="test_siege"),
]

if settings.EXPOSE_DEV_ROUTES:
    urlpatterns += dev_urlpatterns
