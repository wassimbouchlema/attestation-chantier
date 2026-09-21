import mimetypes

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view, inline_serializer
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from comptes.permissions import IsSiege

from ..analyse_coherence import IAIndisponible, analyser_coherence
from ..evaluation_risque import calculer_evaluation_risque
from ..html_sanitization import nettoyer_html
from ..models import (
    Attestation,
    DecisionDemande,
    Demande,
    DemandeComplement,
    Notification,
    PieceJustificative,
    StatutDemande,
    TypeNotification,
)
from ..projet_attestation import generer_contenu_initial
from ..projet_attestation_pdf import generer_pdf
from ..rules import calculer_pieces_manquantes, calculer_pieces_requises
from ..schema_docs import (
    DEMANDE_NON_TRAITABLE,
    TAG_ATTESTATION,
    TAG_FDR,
    TAG_PIECES,
    TAG_RISQUE,
    TAG_SIEGE,
    PiecesDossierSerializer,
)
from ..serializers import (
    DemanderComplementsSerializer,
    EvaluationRisqueSerializer,
    PieceJustificativeSerializer,
    RefuserDemandeSerializer,
)
from ..serializers.attestation import AttestationSerializer, SiegeDemandeDetailSerializer
from .distributeur import DemandePagination


@extend_schema_view(
    list=extend_schema(
        tags=[TAG_SIEGE],
        summary="Lister les demandes à traiter",
        description=(
            "Rôle SIÈGE. Liste paginée (10 par page) des demandes au statut EN_COURS, "
            "c'est-à-dire envoyées par les distributeurs et pas encore traitées. Les brouillons n'apparaissent pas."
        ),
    ),
    retrieve=extend_schema(
        tags=[TAG_SIEGE],
        summary="Consulter une demande à traiter",
        description=(
            "Rôle SIÈGE. Détail d'une demande EN_COURS avec son FDR, la demande de compléments non clôturée "
            "éventuelle (`complement_actif`) et `attestation_existe`."
        ),
        responses={
            200: SiegeDemandeDetailSerializer,
            404: OpenApiResponse(description="Demande introuvable ou non EN_COURS."),
        },
    ),
)
class SiegeDemandeViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsSiege]
    serializer_class = SiegeDemandeDetailSerializer
    lookup_value_converter = "uuid"
    pagination_class = DemandePagination

    def get_queryset(self):
        return Demande.objects.filter(statut=StatutDemande.EN_COURS).select_related("distributeur", "fdr", "attestation")

    def _conflit_traitement(self, demande, *, verifier_complement_actif=False):
        if demande.statut != StatutDemande.EN_COURS or demande.decision is not None:
            return Response(
                {"code": "DEMANDE_NON_TRAITABLE", "detail": "Cette demande ne peut plus être traitée."},
                status=status.HTTP_409_CONFLICT,
            )
        if verifier_complement_actif and demande.complements.filter(received_at__isnull=True).exists():
            return Response(
                {
                    "code": "COMPLEMENTS_DEJA_DEMANDES",
                    "detail": "Des compléments sont déjà demandés. Attendez la réponse du distributeur.",
                },
                status=status.HTTP_409_CONFLICT,
            )
        return None

    @extend_schema(
        tags=[TAG_ATTESTATION],
        summary="Préparer l'attestation définitive",
        description=(
            "Rôle SIÈGE. Crée le brouillon d'attestation à partir du FDR, ou renvoie celui qui existe déjà "
            "(idempotent). Uniquement pour une demande EN_COURS sans décision. Sans corps de requête."
        ),
        request=None,
        responses={
            201: OpenApiResponse(AttestationSerializer, description="Brouillon créé."),
            200: OpenApiResponse(AttestationSerializer, description="Brouillon déjà existant."),
            404: OpenApiResponse(description="Demande introuvable."),
            409: OpenApiResponse(description=DEMANDE_NON_TRAITABLE),
        },
    )
    @action(detail=True, methods=["post"], url_path="attestation/preparer")
    def preparer_attestation(self, request, pk=None):
        with transaction.atomic():
            demande = get_object_or_404(Demande.objects.select_for_update(), pk=pk)
            conflit = self._conflit_traitement(demande)
            if conflit is not None:
                return conflit
            attestation, creee = Attestation.objects.get_or_create(
                demande=demande,
                defaults={"contenu_html": lambda: nettoyer_html(generer_contenu_initial(demande.fdr, preparation=True))},
            )
            return Response(
                AttestationSerializer(attestation).data,
                status=status.HTTP_201_CREATED if creee else status.HTTP_200_OK,
            )

    @extend_schema(
        methods=["GET"],
        tags=[TAG_ATTESTATION],
        summary="Consulter le brouillon d'attestation",
        description="Rôle SIÈGE. Brouillon d'attestation préparé pour une demande EN_COURS sans décision.",
        responses={
            200: AttestationSerializer,
            404: OpenApiResponse(description="Demande introuvable ou attestation non préparée."),
            409: OpenApiResponse(description=DEMANDE_NON_TRAITABLE),
        },
    )
    @extend_schema(
        methods=["PATCH"],
        tags=[TAG_ATTESTATION],
        summary="Modifier le brouillon d'attestation",
        description=(
            "Rôle SIÈGE. Met à jour `contenu_html` (HTML nettoyé côté serveur). Les autres champs sont en lecture "
            "seule. Uniquement pour une demande EN_COURS sans décision."
        ),
        responses={
            200: AttestationSerializer,
            404: OpenApiResponse(description="Demande introuvable ou attestation non préparée."),
            409: OpenApiResponse(description=DEMANDE_NON_TRAITABLE),
        },
    )
    @action(detail=True, methods=["get", "patch"], url_path="attestation")
    def attestation(self, request, pk=None):
        with transaction.atomic():
            demande = get_object_or_404(Demande.objects.select_for_update(), pk=pk)
            conflit = self._conflit_traitement(demande)
            if conflit is not None:
                return conflit
            attestation = get_object_or_404(Attestation, demande=demande)
            if request.method == "PATCH":
                serializer = AttestationSerializer(attestation, data=request.data, partial=True)
                serializer.is_valid(raise_exception=True)
                serializer.save()
            else:
                serializer = AttestationSerializer(attestation)
            return Response(serializer.data)

    @extend_schema(
        tags=[TAG_ATTESTATION],
        summary="Prévisualiser le PDF de l'attestation",
        description=(
            "Rôle SIÈGE. PDF de prévisualisation généré à la volée depuis le brouillon d'attestation ; "
            "ce n'est pas le document définitif."
        ),
        responses={
            (200, "application/pdf"): OpenApiTypes.BINARY,
            404: OpenApiResponse(description="Demande introuvable ou attestation non préparée."),
            409: OpenApiResponse(description=DEMANDE_NON_TRAITABLE),
        },
    )
    @action(detail=True, methods=["get"], url_path="attestation/pdf")
    def attestation_pdf(self, request, pk=None):
        demande = get_object_or_404(Demande.objects.select_related("fdr", "distributeur"), pk=pk)
        conflit = self._conflit_traitement(demande)
        if conflit is not None:
            return conflit
        attestation = get_object_or_404(Attestation, demande=demande)
        response = HttpResponse(
            generer_pdf(demande, nettoyer_html(attestation.contenu_html), preparation=True),
            content_type="application/pdf",
        )
        response["Content-Disposition"] = f'inline; filename="preparation-attestation-{demande.id}.pdf"'
        return response

    @extend_schema(
        tags=[TAG_ATTESTATION],
        summary="Valider l'attestation définitive",
        description=(
            "Rôle SIÈGE. Génère le PDF définitif à partir du brouillon, marque l'attestation comme validée, passe la "
            "demande à TRAITE avec la décision ACCEPTEE et notifie le distributeur, qui peut alors télécharger "
            "l'attestation. Action irréversible. Sans corps de requête."
        ),
        request=None,
        responses={
            200: SiegeDemandeDetailSerializer,
            404: OpenApiResponse(description="Demande introuvable ou attestation non préparée."),
            409: OpenApiResponse(
                description="ATTESTATION_DEJA_VALIDEE, DEMANDE_NON_TRAITABLE ou ATTESTATION_VIDE (contenu vide)."
            ),
        },
    )
    @action(detail=True, methods=["post"], url_path="attestation/valider")
    def valider_attestation(self, request, pk=None):
        nom_pdf = None
        stockage = Attestation._meta.get_field("pdf_final").storage
        try:
            with transaction.atomic():
                demande = get_object_or_404(
                    Demande.objects.select_for_update(of=("self",)).select_related("fdr", "distributeur"), pk=pk
                )
                attestation = get_object_or_404(Attestation.objects.select_for_update(), demande=demande)
                if attestation.validated_at is not None:
                    return Response(
                        {"code": "ATTESTATION_DEJA_VALIDEE", "detail": "Cette attestation est déjà validée."},
                        status=status.HTTP_409_CONFLICT,
                    )
                conflit = self._conflit_traitement(demande)
                if conflit is not None:
                    return conflit
                contenu = nettoyer_html(attestation.contenu_html)
                if not contenu.strip():
                    return Response(
                        {"code": "ATTESTATION_VIDE", "detail": "L'attestation est vide et ne peut pas être validée."},
                        status=status.HTTP_409_CONFLICT,
                    )
                pdf = generer_pdf(demande, contenu, definitif=True)
                attestation.pdf_final.save(f"attestation-definitive-{demande.id}.pdf", ContentFile(pdf), save=False)
                nom_pdf = attestation.pdf_final.name
                attestation.validated_at = timezone.now()
                attestation.save(update_fields=["pdf_final", "validated_at", "updated_at"])
                demande.decision = DecisionDemande.ACCEPTEE
                demande.statut = StatutDemande.TRAITE
                demande.save(update_fields=["decision", "statut", "updated_at"])
                Notification.objects.create(
                    destinataire=demande.distributeur,
                    demande=demande,
                    type_notification=TypeNotification.DEMANDE_ACCEPTEE,
                    titre="Demande acceptée",
                    message="Votre demande a été acceptée. L'attestation définitive est disponible.",
                )
                return Response(self.get_serializer(demande).data)
        except Exception:
            if nom_pdf:
                stockage.delete(nom_pdf)
            raise

    @extend_schema(
        tags=[TAG_ATTESTATION],
        summary="Contrôler la cohérence FDR / attestation",
        description=(
            "Rôle SIÈGE. Aide à la vérification : compare le FDR et le brouillon d'attestation et signale les écarts "
            "(`anomalies`). Le résultat est indicatif ; il ne modifie ni l'attestation ni la demande, ne valide "
            "rien et ne décide pas de l'acceptation, qui reste une décision humaine. Non disponible une fois "
            "l'attestation validée. Sans corps de requête."
        ),
        request=None,
        responses={
            200: inline_serializer(
                "AnalyseCoherence",
                {
                    "coherent": serializers.BooleanField(),
                    "resume": serializers.CharField(),
                    "anomalies": serializers.ListField(
                        child=serializers.DictField(),
                        help_text="Champs : type, champ, valeur_fdr, valeur_attestation, message.",
                    ),
                    "backend": serializers.CharField(help_text="Moteur d'analyse utilisé."),
                },
            ),
            404: OpenApiResponse(description="Demande introuvable ou attestation non préparée."),
            409: OpenApiResponse(description="DEMANDE_NON_TRAITABLE ou ATTESTATION_DEJA_VALIDEE."),
            503: OpenApiResponse(description="IA_INDISPONIBLE : contrôle momentanément indisponible."),
        },
    )
    @action(detail=True, methods=["post"], url_path="attestation/analyser-coherence")
    def analyser_coherence_attestation(self, request, pk=None):
        demande = get_object_or_404(Demande.objects.select_related("fdr"), pk=pk)
        conflit = self._conflit_traitement(demande)
        if conflit is not None:
            return conflit
        attestation = get_object_or_404(Attestation, demande=demande)
        if attestation.validated_at is not None:
            return Response(
                {"code": "ATTESTATION_DEJA_VALIDEE", "detail": "Cette attestation est déjà validée."},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            resultat = analyser_coherence(demande.fdr, attestation)
        except IAIndisponible:
            return Response(
                {"code": "IA_INDISPONIBLE", "detail": "Le contrôle de cohérence est indisponible. Réessayez plus tard."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({**resultat.model_dump(), "backend": settings.AI_COHERENCE_BACKEND})

    @extend_schema(
        tags=[TAG_SIEGE],
        summary="Demander des compléments",
        description=(
            "Rôle SIÈGE. Enregistre un message de demande de compléments et notifie le distributeur. La demande "
            "reste EN_COURS. Une seule demande de compléments non clôturée à la fois. Le traitement de la réponse "
            "du distributeur n'est pas géré par l'API."
        ),
        request=DemanderComplementsSerializer,
        responses={
            201: SiegeDemandeDetailSerializer,
            400: OpenApiResponse(description="`message` vide ou absent."),
            404: OpenApiResponse(description="Demande introuvable."),
            409: OpenApiResponse(description="DEMANDE_NON_TRAITABLE ou COMPLEMENTS_DEJA_DEMANDES."),
        },
    )
    @action(detail=True, methods=["post"], url_path="demander-complements")
    def demander_complements(self, request, pk=None):
        entree = DemanderComplementsSerializer(data=request.data)
        entree.is_valid(raise_exception=True)
        with transaction.atomic():
            demande = get_object_or_404(Demande.objects.select_for_update(), pk=pk)
            conflit = self._conflit_traitement(demande, verifier_complement_actif=True)
            if conflit is not None:
                return conflit
            message = entree.validated_data["message"]
            DemandeComplement.objects.create(demande=demande, message=message)
            Notification.objects.create(
                destinataire=demande.distributeur,
                demande=demande,
                type_notification=TypeNotification.COMPLEMENTS_DEMANDES,
                titre="Compléments demandés",
                message=message,
            )
            return Response(self.get_serializer(demande).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=[TAG_SIEGE],
        summary="Refuser une demande",
        description=(
            "Rôle SIÈGE. Refuse la demande avec un motif obligatoire : passe à TRAITE avec la décision REFUSEE et "
            "notifie le distributeur en lui transmettant le motif. Action irréversible."
        ),
        request=RefuserDemandeSerializer,
        responses={
            200: SiegeDemandeDetailSerializer,
            400: OpenApiResponse(description="`motif` vide ou absent."),
            404: OpenApiResponse(description="Demande introuvable."),
            409: OpenApiResponse(description=DEMANDE_NON_TRAITABLE),
        },
    )
    @action(detail=True, methods=["post"], url_path="refuser")
    def refuser(self, request, pk=None):
        entree = RefuserDemandeSerializer(data=request.data)
        entree.is_valid(raise_exception=True)
        with transaction.atomic():
            demande = get_object_or_404(Demande.objects.select_for_update(), pk=pk)
            conflit = self._conflit_traitement(demande)
            if conflit is not None:
                return conflit
            demande.decision = DecisionDemande.REFUSEE
            demande.motif_refus = entree.validated_data["motif"]
            demande.statut = StatutDemande.TRAITE
            demande.save(update_fields=["decision", "motif_refus", "statut", "updated_at"])
            Notification.objects.create(
                destinataire=demande.distributeur,
                demande=demande,
                type_notification=TypeNotification.DEMANDE_REFUSEE,
                titre="Demande refusée",
                message=demande.motif_refus,
            )
            return Response(self.get_serializer(demande).data)

    @extend_schema(
        tags=[TAG_PIECES],
        summary="Consulter les pièces justificatives",
        description=(
            "Rôle SIÈGE. Pièces déposées pour une demande EN_COURS, catégories requises, catégories manquantes et "
            "`dossier_complet`. Le fichier se télécharge via l'endpoint dédié."
        ),
        responses={200: PiecesDossierSerializer, 404: OpenApiResponse(description="Demande introuvable ou non EN_COURS.")},
    )
    @action(detail=True, methods=["get"], url_path="pieces")
    def pieces(self, request, pk=None):
        demande = self.get_object()
        pieces = demande.pieces.all()
        pieces_requises = calculer_pieces_requises(demande.fdr)
        pieces_presentes = {piece.type_piece for piece in pieces}
        pieces_manquantes = calculer_pieces_manquantes(pieces_requises, pieces_presentes)

        return Response(
            {
                "pieces": PieceJustificativeSerializer(pieces, many=True).data,
                "pieces_requises": pieces_requises,
                "pieces_manquantes": pieces_manquantes,
                "dossier_complet": not pieces_manquantes,
            }
        )

    @extend_schema(
        tags=[TAG_RISQUE],
        summary="Consulter l'évaluation du risque",
        description=(
            "Rôle SIÈGE. Score, niveau (faible, modere, eleve) et synthèse calculés à la volée à partir du FDR "
            "d'une demande EN_COURS. Indicateur d'aide à la décision : il ne décide pas de l'acceptation."
        ),
        responses={200: EvaluationRisqueSerializer, 404: OpenApiResponse(description="Demande introuvable ou non EN_COURS.")},
    )
    @action(detail=True, methods=["get"], url_path="evaluation-risque")
    def evaluation_risque(self, request, pk=None):
        demande = self.get_object()
        serializer = EvaluationRisqueSerializer(calculer_evaluation_risque(demande.fdr))
        return Response(serializer.data)

    @extend_schema(
        tags=[TAG_FDR],
        summary="Consulter le PDF du FDR",
        description="Rôle SIÈGE. PDF du FDR généré à l'envoi, pour une demande EN_COURS.",
        responses={
            (200, "application/pdf"): OpenApiTypes.BINARY,
            404: OpenApiResponse(description="Demande introuvable, non EN_COURS, ou PDF absent."),
        },
    )
    @action(detail=True, methods=["get"], url_path="fdr-pdf")
    def fdr_pdf(self, request, pk=None):
        demande = self.get_object()
        if not demande.fdr_pdf:
            return Response({"detail": "Aucun document généré pour cette demande."}, status=status.HTTP_404_NOT_FOUND)

        return FileResponse(
            demande.fdr_pdf.open("rb"),
            content_type="application/pdf",
            as_attachment=False,
            filename=f"FDR-{demande.id}.pdf",
        )


class SiegePieceJustificativeViewSet(viewsets.GenericViewSet):
    permission_classes = [IsSiege]
    serializer_class = PieceJustificativeSerializer

    @extend_schema(
        tags=[TAG_PIECES],
        summary="Télécharger une pièce justificative",
        description="Rôle SIÈGE. Fichier d'une pièce d'une demande EN_COURS (PDF, JPG ou PNG selon le dépôt).",
        responses={
            (200, "application/octet-stream"): OpenApiTypes.BINARY,
            404: OpenApiResponse(description="Demande non EN_COURS, ou pièce introuvable."),
        },
    )
    def fichier(self, request, demande_id=None, piece_id=None):
        demande = get_object_or_404(
            Demande.objects.filter(statut=StatutDemande.EN_COURS), pk=demande_id
        )
        piece = get_object_or_404(PieceJustificative, pk=piece_id, demande=demande)

        content_type, _ = mimetypes.guess_type(piece.nom_fichier_original)
        return FileResponse(
            piece.fichier.open("rb"),
            content_type=content_type or "application/octet-stream",
            as_attachment=False,
            filename=piece.nom_fichier_original,
        )
