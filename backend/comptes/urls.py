from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import EspaceDistributeurTest, EspaceSiegeTest, Me

urlpatterns = [
    path("auth/login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/me/", Me.as_view(), name="me"),
    path("test/distributeur/", EspaceDistributeurTest.as_view(), name="test_distributeur"),
    path("test/siege/", EspaceSiegeTest.as_view(), name="test_siege"),
]
