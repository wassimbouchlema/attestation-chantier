from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Utilisateur


@admin.register(Utilisateur)
class UtilisateurAdmin(UserAdmin):
    list_display = ("username", "email", "role", "is_staff", "is_active")
    list_filter = ("role", "is_staff", "is_active")
    fieldsets = UserAdmin.fieldsets + (("Rôle métier", {"fields": ("role",)}),)
    add_fieldsets = UserAdmin.add_fieldsets + (("Rôle métier", {"fields": ("role",)}),)
