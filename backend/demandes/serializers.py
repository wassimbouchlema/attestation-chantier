from pathlib import Path

from rest_framework import serializers

from .evaluation_risque import NIVEAU_ELEVE, NIVEAU_FAIBLE, NIVEAU_MODERE
from .models import Demande, FormulaireRisque, PieceJustificative, TypeChantier, Usage
from .rules import TYPES_PIECES_AUTORISES

EXTENSIONS_PIECES_AUTORISEES = {".pdf", ".jpg", ".jpeg", ".png"}
CONTENT_TYPES_PIECES_AUTORISES = {"application/pdf", "image/jpeg", "image/png"}


class DemandeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Demande
        fields = ["id", "distributeur", "statut", "created_at", "updated_at"]
        read_only_fields = fields


class FormulaireRisqueSerializer(serializers.ModelSerializer):
    class Meta:
        model = FormulaireRisque
        fields = [
            "assure_nom",
            "assure_ville",
            "assure_numero_contrat",
            "chantier_nom",
            "chantier_ville",
            "type_chantier",
            "modification_structure",
            "chantier_atypique",
            "usage",
            "usage_autre_texte",
            "date_debut",
            "date_fin",
            "montant_total",
            "intervention_description",
            "intervention_montant_prestation",
            "intervention_type",
            "activite_couverte",
            "activite_non_couverte_texte",
            "travaux_standards",
        ]

    def _valeur_finale(self, attrs, champ):
        if champ in attrs:
            return attrs[champ]
        if self.instance is not None:
            return getattr(self.instance, champ)
        return None

    def validate(self, attrs):
        usage = self._valeur_finale(attrs, "usage")
        usage_autre_texte = self._valeur_finale(attrs, "usage_autre_texte")
        if usage == Usage.AUTRE and not usage_autre_texte:
            raise serializers.ValidationError(
                {"usage_autre_texte": "Une précision est nécessaire lorsque l'usage est \"Autre\"."}
            )

        activite_couverte = self._valeur_finale(attrs, "activite_couverte")
        activite_non_couverte_texte = self._valeur_finale(attrs, "activite_non_couverte_texte")
        if activite_couverte is False and not activite_non_couverte_texte:
            raise serializers.ValidationError(
                {
                    "activite_non_couverte_texte": (
                        "Une explication est nécessaire lorsque l'activité n'est pas couverte par le contrat."
                    )
                }
            )

        date_debut = self._valeur_finale(attrs, "date_debut")
        date_fin = self._valeur_finale(attrs, "date_fin")
        if date_debut is not None and date_fin is not None and date_fin <= date_debut:
            raise serializers.ValidationError(
                {"date_fin": "La date de fin doit être strictement postérieure à la date de début."}
            )

        montant_total = self._valeur_finale(attrs, "montant_total")
        intervention_montant_prestation = self._valeur_finale(attrs, "intervention_montant_prestation")
        if (
            montant_total is not None
            and intervention_montant_prestation is not None
            and intervention_montant_prestation >= montant_total
        ):
            raise serializers.ValidationError(
                {
                    "intervention_montant_prestation": (
                        "Le montant de la prestation doit être strictement inférieur au montant total."
                    )
                }
            )

        # Normalisation : modification_structure n'a de sens que si le chantier est une rénovation.
        # Un changement de type_chantier qui invalide une réponse déjà donnée (ou une réponse envoyée
        # alors que le chantier n'est pas une rénovation) est silencieusement remis à null plutôt que
        # rejeté : ce n'est pas une erreur de saisie, juste une donnée devenue sans objet.
        type_chantier = self._valeur_finale(attrs, "type_chantier")
        modification_structure = self._valeur_finale(attrs, "modification_structure")
        if type_chantier != TypeChantier.RENOVATION and modification_structure is not None:
            attrs["modification_structure"] = None

        return attrs


class DemandeDetailSerializer(DemandeSerializer):
    fdr = FormulaireRisqueSerializer(read_only=True)

    class Meta(DemandeSerializer.Meta):
        fields = DemandeSerializer.Meta.fields + ["fdr"]


class PieceJustificativeSerializer(serializers.ModelSerializer):
    type_piece = serializers.ChoiceField(choices=TYPES_PIECES_AUTORISES)

    class Meta:
        model = PieceJustificative
        fields = ["id", "type_piece", "fichier", "nom_fichier_original", "uploaded_at"]
        read_only_fields = ["id", "nom_fichier_original", "uploaded_at"]
        extra_kwargs = {"fichier": {"write_only": True}}

    def validate_fichier(self, fichier):
        extension = Path(fichier.name).suffix.lower()
        if extension not in EXTENSIONS_PIECES_AUTORISEES or (
            fichier.content_type not in CONTENT_TYPES_PIECES_AUTORISES
        ):
            raise serializers.ValidationError(
                "Type de fichier non autorisé (formats acceptés : PDF, JPG, PNG)."
            )
        return fichier

    def create(self, validated_data):
        # Le nom original ne sert qu'à l'affichage : basename seul (jamais un
        # chemin fourni par le client), distinct du chemin de stockage réel
        # généré par `chemin_upload_piece`.
        validated_data["nom_fichier_original"] = Path(validated_data["fichier"].name).name
        return super().create(validated_data)


class EvaluationRisqueSerializer(serializers.Serializer):
    """Sérialisation en lecture seule de `calculer_evaluation_risque` — introspection
    OpenAPI uniquement, ne correspond à aucun modèle (rien n'est stocké en base)."""

    score = serializers.IntegerField(read_only=True)
    niveau = serializers.ChoiceField(
        choices=[NIVEAU_FAIBLE, NIVEAU_MODERE, NIVEAU_ELEVE], read_only=True
    )
    synthese = serializers.CharField(read_only=True)
