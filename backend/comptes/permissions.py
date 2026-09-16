from rest_framework.permissions import BasePermission

from .models import Role


class IsDistributeur(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.DISTRIBUTEUR


class IsSiege(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.SIEGE
