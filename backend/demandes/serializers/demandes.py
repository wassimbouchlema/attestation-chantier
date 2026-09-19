from rest_framework import serializers

from ..evaluation_risque import NIVEAU_ELEVE, NIVEAU_FAIBLE, NIVEAU_MODERE
from ..models import DecisionDemande, Demande, FormulaireRisque, TypeChantier, Usage
from .siege import DemandeComplementSerializer


class DemandeSerializer(serializers.ModelSerializer):
    attestation_finale = serializers.SerializerMethodField()
    assure_nom = serializers.SerializerMethodField()
    chantier_nom = serializers.SerializerMethodField()

    class Meta:
        model = Demande
        fields = [
            "id", "distributeur", "statut", "decision", "created_at", "updated_at", "envoye_at", "last_relance_at",
            "attestation_finale", "assure_nom", "chantier_nom",
        ]
        read_only_fields = fields

    def get_assure_nom(self, demande):
        fdr = getattr(demande, "fdr", None)
        return fdr.assure_nom if fdr else ""

    def get_chantier_nom(self, demande):
        fdr = getattr(demande, "fdr", None)
        return fdr.chantier_nom if fdr else ""

    def get_attestation_finale(self, demande):
        attestation = getattr(demande, "attestation", None)
        if demande.decision != DecisionDemande.ACCEPTEE or attestation is None or not attestation.pdf_final:
            return None
        return {"validated_at": attestation.validated_at}


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

        # Un changement de type rend la réponse sans objet plutôt qu'invalide.
        type_chantier = self._valeur_finale(attrs, "type_chantier")
        modification_structure = self._valeur_finale(attrs, "modification_structure")
        if type_chantier != TypeChantier.RENOVATION and modification_structure is not None:
            attrs["modification_structure"] = None

        return attrs


class DemandeDetailSerializer(DemandeSerializer):
    fdr = FormulaireRisqueSerializer(read_only=True)
    distributeur_nom = serializers.SerializerMethodField()
    complement_actif = serializers.SerializerMethodField()

    class Meta(DemandeSerializer.Meta):
        fields = DemandeSerializer.Meta.fields + [
            "commentaire_distributeur", "fdr", "distributeur_nom", "motif_refus", "complement_actif",
        ]
        read_only_fields = fields

    def get_complement_actif(self, demande):
        complement = demande.complements.filter(received_at__isnull=True).first()
        return DemandeComplementSerializer(complement).data if complement else None

    def get_distributeur_nom(self, demande):
        return demande.distributeur.get_full_name() or demande.distributeur.get_username()


class CommentaireDistributeurSerializer(serializers.ModelSerializer):
    class Meta:
        model = Demande
        fields = ["commentaire_distributeur"]


class EnvoyerDemandeSerializer(serializers.Serializer):
    commentaire_distributeur = serializers.CharField(
        required=False, allow_blank=True, trim_whitespace=False
    )


class EvaluationRisqueSerializer(serializers.Serializer):
    score = serializers.IntegerField(read_only=True)
    niveau = serializers.ChoiceField(
        choices=[NIVEAU_FAIBLE, NIVEAU_MODERE, NIVEAU_ELEVE], read_only=True
    )
    synthese = serializers.CharField(read_only=True)
