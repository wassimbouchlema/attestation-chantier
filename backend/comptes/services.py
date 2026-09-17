from .models import Role, Utilisateur


class ErreurConfigurationSiege(Exception):
    """Aucun compte SIÈGE, ou plusieurs : erreur de configuration serveur, pas une erreur utilisateur."""


def obtenir_compte_siege_unique() -> Utilisateur:
    """Résout le compte SIÈGE destinataire des notifications d'envoi.

    Hypothèse fonctionnelle actuelle : exactement un compte SIÈGE existe. Pas
    de mécanisme d'assignation ni de contrainte DB associée (simplification de
    test, pas une règle produit irréversible) — 0 ou plusieurs comptes SIÈGE
    lève explicitement une erreur de configuration plutôt que de choisir
    silencieusement un compte au hasard (`.first()`).
    """
    comptes_siege = Utilisateur.objects.filter(role=Role.SIEGE)
    nombre = comptes_siege.count()
    if nombre == 0:
        raise ErreurConfigurationSiege("Aucun compte SIÈGE configuré.")
    if nombre > 1:
        raise ErreurConfigurationSiege("Plusieurs comptes SIÈGE configurés : configuration ambiguë.")
    return comptes_siege.get()
