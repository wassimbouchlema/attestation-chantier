from datetime import timedelta

from django.core.files.base import ContentFile
from django.core.mail import EmailMessage
from django.db import transaction
from django.db.models import Exists, OuterRef
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    extend_schema_view,
    inline_serializer,
)
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from comptes.permissions import IsDistributeur
from comptes.services import ErreurConfigurationSiege, obtenir_compte_siege_unique

from ..evaluation_risque import calculer_evaluation_risque
from ..extracteur_fdr import DocumentAExtraire, ExtractionDocumentIndisponible, obtenir_extracteur_fdr
from ..html_sanitization import nettoyer_html
from ..models import (
    DecisionDemande,
    Demande,
    DemandeComplement,
    FormulaireRisque,
    Notification,
    PieceJustificative,
    ProjetAttestation,
    StatutDemande,
    TypeNotification,
)
from ..pdf import generer_pdf_fdr
from ..projet_attestation import generer_contenu_initial
from ..projet_attestation_pdf import generer_pdf
from ..rules import calculer_pieces_manquantes, calculer_pieces_requises
from ..schema_docs import (
    DEMANDE_INTROUVABLE,
    DEMANDE_NON_MODIFIABLE,
    TAG_ATTESTATION,
    TAG_DEMANDES,
    TAG_FDR,
    TAG_PIECES,
    TAG_RISQUE,
    PiecesDossierSerializer,
)
from ..serializers import (
    CommentaireDistributeurSerializer,
    DemandeDetailSerializer,
    DemandeSerializer,
    EnvoyerDemandeSerializer,
    EvaluationRisqueSerializer,
    ExtractionDocumentSerializer,
    FormulaireRisqueSerializer,
    PieceJustificativeSerializer,
    ProjetAttestationSerializer,
)
from ..validation_envoi import valider_fdr_pret_a_envoyer

TITRE_DEMANDE_ENVOYEE = "Nouvelle demande reçue"
MESSAGE_DEMANDE_ENVOYEE = "Une nouvelle demande d'attestation de chantier a été envoyée."

TITRE_RELANCE = "Demande relancée"
MESSAGE_RELANCE = "Le distributeur a relancé une demande en cours de traitement."

DELAI_RELANCE = timedelta(hours=24)

DECISION_EN_ATTENTE = "EN_ATTENTE"

COMPLEMENTS_DEMANDES = "DEMANDES"
COMPLEMENTS_AUCUN = "AUCUN"
FILTRES_COMPLEMENTS = (COMPLEMENTS_DEMANDES, COMPLEMENTS_AUCUN)


class DemandePagination(PageNumberPagination):
    page_size = 10


@extend_schema_view(
    list=extend_schema(
        tags=[TAG_DEMANDES],
        summary="Lister mes demandes",
        description=(
            "Rôle DISTRIBUTEUR. Liste paginée (10 par page) des demandes du distributeur connecté, "
            "brouillons inclus. Filtres optionnels combinables."
        ),
        parameters=[
            OpenApiParameter("statut", enum=list(StatutDemande.values), description="Filtre sur le statut."),
            OpenApiParameter(
                "decision",
                enum=[*DecisionDemande.values, DECISION_EN_ATTENTE],
                description="EN_ATTENTE : demandes EN_COURS sans décision.",
            ),
            OpenApiParameter(
                "complements",
                enum=list(FILTRES_COMPLEMENTS),
                description="DEMANDES : au moins une demande de compléments ; AUCUN : aucune.",
            ),
        ],
        responses={
            200: DemandeSerializer(many=True),
            400: OpenApiResponse(description="Valeur de filtre invalide."),
        },
    ),
    retrieve=extend_schema(
        tags=[TAG_DEMANDES],
        summary="Consulter une demande",
        description=(
            "Rôle DISTRIBUTEUR. Détail d'une de ses demandes : statut, décision, FDR, commentaire, motif de refus "
            "éventuel et demande de compléments non clôturée (`complement_actif`)."
        ),
        responses={200: DemandeDetailSerializer, 404: OpenApiResponse(description=DEMANDE_INTROUVABLE)},
    ),
)
class DemandeViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsDistributeur]
    serializer_class = DemandeSerializer
    lookup_value_converter = "uuid"
    pagination_class = DemandePagination

    def get_queryset(self):
        queryset = Demande.objects.filter(distributeur=self.request.user)

        if self.action == "list":
            statut = self.request.query_params.get("statut")
            if statut:
                if statut not in StatutDemande.values:
                    raise ValidationError(
                        {
                            "statut": (
                                "Valeur invalide. Valeurs autorisées : "
                                f"{', '.join(StatutDemande.values)}."
                            )
                        }
                    )
                queryset = queryset.filter(statut=statut)
            decision = self.request.query_params.get("decision")
            if decision:
                if decision == DECISION_EN_ATTENTE:
                    queryset = queryset.filter(statut=StatutDemande.EN_COURS, decision__isnull=True)
                elif decision in DecisionDemande.values:
                    queryset = queryset.filter(decision=decision)
                else:
                    raise ValidationError(
                        {
                            "decision": (
                                "Valeur invalide. Valeurs autorisées : "
                                f"{', '.join([*DecisionDemande.values, DECISION_EN_ATTENTE])}."
                            )
                        }
                    )
            complements = self.request.query_params.get("complements")
            if complements:
                if complements not in FILTRES_COMPLEMENTS:
                    raise ValidationError(
                        {
                            "complements": (
                                "Valeur invalide. Valeurs autorisées : "
                                f"{', '.join(FILTRES_COMPLEMENTS)}."
                            )
                        }
                    )
                a_des_complements = Exists(DemandeComplement.objects.filter(demande=OuterRef("pk")))
                queryset = queryset.filter(
                    a_des_complements if complements == COMPLEMENTS_DEMANDES else ~a_des_complements
                )
            queryset = queryset.select_related("attestation", "fdr")

        return queryset

    def get_serializer_class(self):
        if self.action == "retrieve":
            return DemandeDetailSerializer
        if self.action == "fdr":
            return FormulaireRisqueSerializer
        if self.action == "evaluation_risque":
            return EvaluationRisqueSerializer
        if self.action == "commentaire":
            return CommentaireDistributeurSerializer
        if self.action == "projet_attestation":
            return ProjetAttestationSerializer
        if self.action == "extraire_document":
            return ExtractionDocumentSerializer
        return DemandeSerializer

    @extend_schema(
        tags=[TAG_DEMANDES],
        summary="Créer une demande (brouillon)",
        description=(
            "Rôle DISTRIBUTEUR. Crée une demande au statut BROUILLON avec son FDR. Le FDR fourni dans `fdr` doit être "
            "complet et valide dès la création (mêmes règles qu'à l'envoi) ; sinon rien n'est créé."
        ),
        request=inline_serializer("DemandeCreation", {"fdr": FormulaireRisqueSerializer()}),
        responses={
            201: DemandeDetailSerializer,
            400: OpenApiResponse(description="FDR_INVALIDE : `erreurs` liste un message par champ en erreur."),
        },
    )
    def create(self, request, *args, **kwargs):
        fdr_payload = request.data.get("fdr")
        fdr_serializer = FormulaireRisqueSerializer(data=fdr_payload if isinstance(fdr_payload, dict) else {})
        if not fdr_serializer.is_valid():
            erreurs = {
                champ: " ".join(str(message) for message in messages)
                for champ, messages in fdr_serializer.errors.items()
            }
            return Response({"code": "FDR_INVALIDE", "erreurs": erreurs}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            demande = Demande.objects.create(distributeur=request.user, statut=StatutDemande.BROUILLON)
            fdr = FormulaireRisque.objects.create(demande=demande, **fdr_serializer.validated_data)

            erreurs_completude = valider_fdr_pret_a_envoyer(fdr)
            if erreurs_completude:
                transaction.set_rollback(True)
                return Response(
                    {"code": "FDR_INVALIDE", "erreurs": erreurs_completude}, status=status.HTTP_400_BAD_REQUEST
                )

        return Response(DemandeDetailSerializer(demande).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=[TAG_FDR],
        summary="Extraire un FDR depuis un document (préremplissage)",
        description=(
            "Rôle DISTRIBUTEUR. Upload multipart d'un document PDF unique. Extrait les informations "
            "explicitement présentes dans le document pour proposer un préremplissage du FDR. Ne crée "
            "et ne modifie aucune donnée : le résultat est à vérifier et compléter avant toute création "
            "de demande via l'endpoint de création habituel."
        ),
        request=ExtractionDocumentSerializer,
        responses={
            200: OpenApiResponse(description="Résultat structuré de l'extraction (ResultatExtractionFdr)."),
            400: OpenApiResponse(description="Document absent, vide, ou type non supporté (PDF uniquement)."),
            503: OpenApiResponse(description="EXTRACTION_INDISPONIBLE : service d'extraction momentanément indisponible."),
        },
    )
    @action(detail=False, methods=["post"], url_path="extraire-document")
    def extraire_document(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fichier = serializer.validated_data["document"]

        document = DocumentAExtraire(
            contenu=fichier.read(),
            type_mime=fichier.content_type,
            nom_fichier=fichier.name,
        )
        try:
            resultat = obtenir_extracteur_fdr().extraire(document)
        except ExtractionDocumentIndisponible:
            return Response(
                {
                    "code": "EXTRACTION_INDISPONIBLE",
                    "detail": "Le service d'extraction est indisponible. Réessayez plus tard.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(resultat.model_dump())

    @extend_schema(
        tags=[TAG_DEMANDES],
        summary="Supprimer un brouillon",
        description=(
            "Rôle DISTRIBUTEUR. Supprime définitivement un brouillon, avec ses pièces justificatives. "
            "Impossible dès que la demande a été envoyée."
        ),
        responses={
            204: OpenApiResponse(description="Brouillon supprimé."),
            404: OpenApiResponse(description=DEMANDE_INTROUVABLE),
            409: OpenApiResponse(description=DEMANDE_NON_MODIFIABLE),
        },
    )
    def destroy(self, request, *args, **kwargs):
        demande = self.get_object()
        if demande.statut != StatutDemande.BROUILLON:
            return Response(
                {"detail": "Cette demande n'est plus modifiable (statut différent de BROUILLON)."},
                status=status.HTTP_409_CONFLICT,
            )

        for piece in demande.pieces.all():
            piece.fichier.delete(save=False)
        if demande.fdr_pdf:
            demande.fdr_pdf.delete(save=False)

        demande.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        methods=["GET"],
        tags=[TAG_FDR],
        summary="Consulter le FDR",
        description="Rôle DISTRIBUTEUR. Formulaire de risque (FDR) de sa demande, quel que soit le statut.",
        responses={200: FormulaireRisqueSerializer, 404: OpenApiResponse(description=DEMANDE_INTROUVABLE)},
    )
    @extend_schema(
        methods=["PATCH"],
        tags=[TAG_FDR],
        summary="Modifier le FDR (brouillon)",
        description=(
            "Rôle DISTRIBUTEUR. Mise à jour partielle : seuls les champs fournis sont modifiés et un FDR incomplet "
            "est accepté. Règles vérifiées : précision obligatoire si usage AUTRE ou activité non couverte, "
            "date de fin postérieure à la date de début, montant de prestation inférieur au montant total. "
            "`modification_structure` est remis à null si le chantier n'est pas une rénovation."
        ),
        responses={
            200: FormulaireRisqueSerializer,
            400: OpenApiResponse(description="Champ invalide, par champ."),
            404: OpenApiResponse(description=DEMANDE_INTROUVABLE),
            409: OpenApiResponse(description=DEMANDE_NON_MODIFIABLE),
        },
    )
    @action(detail=True, methods=["get", "patch"], url_path="fdr")
    def fdr(self, request, pk=None):
        demande = self.get_object()

        if request.method == "GET":
            serializer = self.get_serializer(demande.fdr)
            return Response(serializer.data)

        if demande.statut != StatutDemande.BROUILLON:
            return Response(
                {"detail": "Cette demande n'est plus modifiable (statut différent de BROUILLON)."},
                status=status.HTTP_409_CONFLICT,
            )

        serializer = self.get_serializer(demande.fdr, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @extend_schema(
        tags=[TAG_RISQUE],
        summary="Consulter l'évaluation du risque",
        description=(
            "Rôle DISTRIBUTEUR. Score, niveau (faible, modere, eleve) et synthèse calculés à la volée à partir du FDR "
            "courant. Indicateur d'aide : il ne constitue pas une décision."
        ),
        responses={200: EvaluationRisqueSerializer, 404: OpenApiResponse(description=DEMANDE_INTROUVABLE)},
    )
    @action(detail=True, methods=["get"], url_path="evaluation-risque")
    def evaluation_risque(self, request, pk=None):
        demande = self.get_object()
        serializer = self.get_serializer(calculer_evaluation_risque(demande.fdr))
        return Response(serializer.data)

    @extend_schema(
        tags=[TAG_DEMANDES],
        summary="Modifier le commentaire du distributeur",
        description=(
            "Rôle DISTRIBUTEUR. Enregistre le commentaire joint à la demande. Modifiable uniquement en BROUILLON ; "
            "il peut aussi être fourni à l'envoi."
        ),
        responses={
            200: CommentaireDistributeurSerializer,
            404: OpenApiResponse(description=DEMANDE_INTROUVABLE),
            409: OpenApiResponse(description=DEMANDE_NON_MODIFIABLE),
        },
    )
    @action(detail=True, methods=["patch"], url_path="commentaire")
    def commentaire(self, request, pk=None):
        demande = self.get_object()
        if demande.statut != StatutDemande.BROUILLON:
            return Response(
                {"detail": "Cette demande n'est plus modifiable (statut différent de BROUILLON)."},
                status=status.HTTP_409_CONFLICT,
            )

        serializer = self.get_serializer(demande, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @extend_schema(
        tags=[TAG_FDR],
        summary="Consulter le PDF du FDR",
        description=(
            "Rôle DISTRIBUTEUR. PDF du FDR généré à l'envoi de la demande ; il n'existe donc pas pour un brouillon."
        ),
        responses={
            (200, "application/pdf"): OpenApiTypes.BINARY,
            404: OpenApiResponse(description="Aucun PDF généré (demande non envoyée) ou demande introuvable."),
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

    @extend_schema(
        tags=[TAG_ATTESTATION],
        summary="Télécharger l'attestation définitive",
        description=(
            "Rôle DISTRIBUTEUR. PDF de l'attestation définitive, disponible uniquement lorsque la demande a été "
            "acceptée par le SIÈGE et l'attestation validée."
        ),
        responses={
            (200, "application/pdf"): OpenApiTypes.BINARY,
            404: OpenApiResponse(description="Demande non acceptée, attestation non validée ou demande introuvable."),
        },
    )
    @action(detail=True, methods=["get"], url_path="attestation-finale/pdf")
    def attestation_finale_pdf(self, request, pk=None):
        demande = self.get_object()
        attestation = getattr(demande, "attestation", None)
        if demande.decision != DecisionDemande.ACCEPTEE or attestation is None or not attestation.pdf_final:
            return Response({"detail": "Aucune attestation définitive pour cette demande."}, status=status.HTTP_404_NOT_FOUND)

        return FileResponse(
            attestation.pdf_final.open("rb"),
            content_type="application/pdf",
            as_attachment=False,
            filename=f"attestation-definitive-{demande.id}.pdf",
        )

    @extend_schema(
        tags=[TAG_DEMANDES],
        summary="Valider et envoyer la demande au SIÈGE",
        description=(
            "Rôle DISTRIBUTEUR. Contrôle la complétude du FDR et des pièces justificatives requises, génère le PDF "
            "du FDR, passe la demande de BROUILLON à EN_COURS et notifie le SIÈGE. `commentaire_distributeur` "
            "est facultatif et remplace le commentaire enregistré."
        ),
        request=EnvoyerDemandeSerializer,
        responses={
            200: DemandeDetailSerializer,
            400: OpenApiResponse(
                description="FDR_INVALIDE (`erreurs` par champ) ou DOSSIER_INCOMPLET (`pieces_manquantes`)."
            ),
            404: OpenApiResponse(description=DEMANDE_INTROUVABLE),
            409: OpenApiResponse(description=DEMANDE_NON_MODIFIABLE),
            500: OpenApiResponse(description="Compte SIÈGE introuvable ou ambigu (configuration serveur)."),
        },
    )
    @action(detail=True, methods=["post"], url_path="envoyer")
    def envoyer(self, request, pk=None):
        entree = EnvoyerDemandeSerializer(data=request.data)
        entree.is_valid(raise_exception=True)

        with transaction.atomic():
            demande = get_object_or_404(
                Demande.objects.select_for_update().filter(distributeur=request.user),
                pk=pk,
            )

            if demande.statut != StatutDemande.BROUILLON:
                return Response(
                    {"detail": "Cette demande n'est plus modifiable (statut différent de BROUILLON)."},
                    status=status.HTTP_409_CONFLICT,
                )

            erreurs_fdr = valider_fdr_pret_a_envoyer(demande.fdr)
            if erreurs_fdr:
                return Response(
                    {"code": "FDR_INVALIDE", "erreurs": erreurs_fdr}, status=status.HTTP_400_BAD_REQUEST
                )

            pieces_requises = calculer_pieces_requises(demande.fdr)
            pieces_presentes = {piece.type_piece for piece in demande.pieces.all()}
            pieces_manquantes = calculer_pieces_manquantes(pieces_requises, pieces_presentes)
            if pieces_manquantes:
                return Response(
                    {"code": "DOSSIER_INCOMPLET", "pieces_manquantes": pieces_manquantes},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                siege = obtenir_compte_siege_unique()
            except ErreurConfigurationSiege:
                return Response(
                    {"detail": "Configuration serveur invalide : compte SIÈGE introuvable ou ambigu."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            if "commentaire_distributeur" in entree.validated_data:
                demande.commentaire_distributeur = entree.validated_data["commentaire_distributeur"]
            commentaire_final = demande.commentaire_distributeur

            envoye_at = timezone.now()
            pdf_bytes = generer_pdf_fdr(demande, envoye_at=envoye_at, commentaire_distributeur=commentaire_final)

            try:
                demande.fdr_pdf.save(f"{demande.id}.pdf", ContentFile(pdf_bytes), save=False)
                demande.statut = StatutDemande.EN_COURS
                demande.envoye_at = envoye_at
                demande.save()
                Notification.objects.create(
                    destinataire=siege,
                    demande=demande,
                    type_notification=TypeNotification.DEMANDE_ENVOYEE,
                    titre=TITRE_DEMANDE_ENVOYEE,
                    message=MESSAGE_DEMANDE_ENVOYEE,
                )
            except Exception:
                # La transaction protège la base, pas le fichier créé pendant la tentative.
                if demande.fdr_pdf:
                    demande.fdr_pdf.delete(save=False)
                raise

        return Response(DemandeDetailSerializer(demande).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=[TAG_DEMANDES],
        summary="Relancer le SIÈGE",
        description=(
            "Rôle DISTRIBUTEUR. Envoie un email de relance au SIÈGE et crée une notification pour une demande "
            "EN_COURS. Une seule relance par période de 24 h ; `prochaine_relance_at` indique la prochaine date "
            "possible. Sans corps de requête."
        ),
        request=None,
        responses={
            200: OpenApiResponse(
                DemandeDetailSerializer, description="Détail de la demande, complété de `prochaine_relance_at`."
            ),
            404: OpenApiResponse(description=DEMANDE_INTROUVABLE),
            409: OpenApiResponse(
                description=(
                    "RELANCE_NON_AUTORISEE (demande non EN_COURS) ou DELAI_RELANCE_NON_ECOULE "
                    "(avec `prochaine_relance_at`)."
                )
            ),
            500: OpenApiResponse(description="Compte SIÈGE ou son email indisponible (configuration serveur)."),
            502: OpenApiResponse(description="Échec de l'envoi de l'email ; aucune relance enregistrée."),
        },
    )
    @action(detail=True, methods=["post"], url_path="relancer")
    def relancer(self, request, pk=None):
        with transaction.atomic():
            demande = get_object_or_404(
                Demande.objects.select_for_update().filter(distributeur=request.user),
                pk=pk,
            )

            if demande.statut != StatutDemande.EN_COURS:
                return Response(
                    {
                        "code": "RELANCE_NON_AUTORISEE",
                        "detail": "Seule une demande en cours peut être relancée.",
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            maintenant = timezone.now()
            if demande.last_relance_at is not None:
                prochaine_relance_at = demande.last_relance_at + DELAI_RELANCE
                if maintenant < prochaine_relance_at:
                    return Response(
                        {
                            "code": "DELAI_RELANCE_NON_ECOULE",
                            "detail": "Une nouvelle relance pourra être envoyée ultérieurement.",
                            "prochaine_relance_at": prochaine_relance_at,
                        },
                        status=status.HTTP_409_CONFLICT,
                    )

            try:
                siege = obtenir_compte_siege_unique()
            except ErreurConfigurationSiege:
                return Response(
                    {"detail": "Configuration serveur invalide : compte SIÈGE introuvable ou ambigu."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            if not siege.email:
                return Response(
                    {
                        "code": "EMAIL_SIEGE_INDISPONIBLE",
                        "detail": "Aucune adresse email n'est configurée pour le compte SIÈGE.",
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            distributeur_affiche = request.user.get_full_name() or request.user.get_username()
            corps = (
                "Bonjour,\n\n"
                f"Le distributeur {distributeur_affiche} vous relance concernant "
                f"la demande d'attestation {demande.id}, actuellement en cours de traitement.\n\n"
                "Merci de consulter la demande dans l'application.\n\n"
                "Cordialement,\n"
                "Attestation de chantier"
            )

            # La persistance n'a lieu que si le transport confirme l'envoi.
            try:
                EmailMessage(
                    subject="[Attestation de chantier] Relance d'une demande en cours",
                    body=corps,
                    to=[siege.email],
                ).send(fail_silently=False)
            except Exception:
                transaction.set_rollback(True)
                return Response(
                    {"detail": "Impossible d'envoyer l'email de relance au siège."},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            demande.last_relance_at = maintenant
            demande.save(update_fields=["last_relance_at"])
            Notification.objects.create(
                destinataire=siege,
                demande=demande,
                type_notification=TypeNotification.RELANCE,
                titre=TITRE_RELANCE,
                message=MESSAGE_RELANCE,
            )

        return Response(
            {
                **DemandeDetailSerializer(demande).data,
                "prochaine_relance_at": demande.last_relance_at + DELAI_RELANCE,
            },
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        methods=["GET"],
        tags=[TAG_ATTESTATION],
        summary="Consulter le projet d'attestation",
        description="Rôle DISTRIBUTEUR. Texte (HTML nettoyé) du projet d'attestation de sa demande.",
        responses={
            200: ProjetAttestationSerializer,
            404: OpenApiResponse(description="Aucun projet d'attestation ou demande introuvable."),
        },
    )
    @extend_schema(
        methods=["POST"],
        tags=[TAG_ATTESTATION],
        summary="Créer le projet d'attestation",
        description=(
            "Rôle DISTRIBUTEUR. Génère le contenu initial du projet à partir du FDR. Uniquement pour une demande "
            "EN_COURS ; un seul projet par demande. Sans corps de requête."
        ),
        request=None,
        responses={
            201: ProjetAttestationSerializer,
            404: OpenApiResponse(description=DEMANDE_INTROUVABLE),
            409: OpenApiResponse(description="PROJET_NON_AUTORISE (demande non EN_COURS) ou PROJET_DEJA_EXISTANT."),
        },
    )
    @extend_schema(
        methods=["PATCH"],
        tags=[TAG_ATTESTATION],
        summary="Modifier le projet d'attestation",
        description=(
            "Rôle DISTRIBUTEUR. Met à jour `contenu_html` ; le HTML est nettoyé côté serveur. "
            "Uniquement tant que la demande est EN_COURS."
        ),
        responses={
            200: ProjetAttestationSerializer,
            404: OpenApiResponse(description="Aucun projet d'attestation ou demande introuvable."),
            409: OpenApiResponse(description="Demande n'étant plus EN_COURS."),
        },
    )
    @action(detail=True, methods=["get", "post", "patch"], url_path="projet-attestation")
    def projet_attestation(self, request, pk=None):
        demande = self.get_object()

        if request.method == "GET":
            projet = getattr(demande, "projet_attestation", None)
            if projet is None:
                return Response(status=status.HTTP_404_NOT_FOUND)
            return Response(self.get_serializer(projet).data)

        if request.method == "POST":
            if demande.statut != StatutDemande.EN_COURS:
                return Response(
                    {
                        "code": "PROJET_NON_AUTORISE",
                        "detail": "Un projet d'attestation ne peut être créé que pour une demande en cours.",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            if getattr(demande, "projet_attestation", None) is not None:
                return Response(
                    {
                        "code": "PROJET_DEJA_EXISTANT",
                        "detail": "Un projet d'attestation existe déjà pour cette demande.",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            projet = ProjetAttestation.objects.create(
                demande=demande,
                contenu_html=nettoyer_html(generer_contenu_initial(demande.fdr)),
            )
            return Response(self.get_serializer(projet).data, status=status.HTTP_201_CREATED)

        projet = getattr(demande, "projet_attestation", None)
        if projet is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if demande.statut != StatutDemande.EN_COURS:
            return Response(
                {"detail": "Cette demande n'est plus modifiable (statut différent de EN_COURS)."},
                status=status.HTTP_409_CONFLICT,
            )
        serializer = self.get_serializer(projet, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @extend_schema(
        tags=[TAG_ATTESTATION],
        summary="Télécharger le PDF du projet d'attestation",
        description="Rôle DISTRIBUTEUR. PDF généré à la volée à partir du projet d'attestation enregistré.",
        responses={
            (200, "application/pdf"): OpenApiTypes.BINARY,
            404: OpenApiResponse(description="Aucun projet d'attestation ou demande introuvable."),
        },
    )
    @action(detail=True, methods=["get"], url_path="projet-attestation/pdf")
    def projet_attestation_pdf(self, request, pk=None):
        demande = self.get_object()
        projet = getattr(demande, "projet_attestation", None)
        if projet is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        pdf = generer_pdf(demande, projet.contenu_html)
        return HttpResponse(
            pdf,
            content_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="projet-attestation-{demande.id}.pdf"'},
        )


class PieceJustificativeViewSet(viewsets.GenericViewSet):
    permission_classes = [IsDistributeur]
    serializer_class = PieceJustificativeSerializer

    def _get_demande(self):
        return get_object_or_404(
            Demande.objects.filter(distributeur=self.request.user),
            pk=self.kwargs["demande_id"],
        )

    def _refuser_hors_brouillon(self, demande):
        if demande.statut != StatutDemande.BROUILLON:
            return Response(
                {"detail": "Cette demande n'est plus modifiable (statut différent de BROUILLON)."},
                status=status.HTTP_409_CONFLICT,
            )
        return None

    @extend_schema(
        tags=[TAG_PIECES],
        summary="Lister les pièces justificatives",
        description=(
            "Rôle DISTRIBUTEUR. Pièces déposées, catégories requises d'après le FDR (`pieces_requises`), "
            "catégories manquantes et indicateur `dossier_complet`."
        ),
        responses={200: PiecesDossierSerializer, 404: OpenApiResponse(description=DEMANDE_INTROUVABLE)},
    )
    def list(self, request, *args, **kwargs):
        demande = self._get_demande()
        pieces = PieceJustificative.objects.filter(demande=demande)
        pieces_requises = calculer_pieces_requises(demande.fdr)
        pieces_presentes = {piece.type_piece for piece in pieces}
        pieces_manquantes = calculer_pieces_manquantes(pieces_requises, pieces_presentes)

        return Response(
            {
                "pieces": self.get_serializer(pieces, many=True).data,
                "pieces_requises": pieces_requises,
                "pieces_manquantes": pieces_manquantes,
                "dossier_complet": not pieces_manquantes,
            }
        )

    @extend_schema(
        tags=[TAG_PIECES],
        summary="Ajouter une pièce justificative",
        description=(
            "Rôle DISTRIBUTEUR. Dépose un fichier (multipart) pour une catégorie : structure, usage, complexite, "
            "montant, activite ou travaux. Formats acceptés : PDF, JPG, PNG. Uniquement en BROUILLON."
        ),
        responses={
            201: PieceJustificativeSerializer,
            400: OpenApiResponse(description="Catégorie inconnue ou type de fichier non autorisé."),
            404: OpenApiResponse(description=DEMANDE_INTROUVABLE),
            409: OpenApiResponse(description=DEMANDE_NON_MODIFIABLE),
        },
    )
    def create(self, request, *args, **kwargs):
        demande = self._get_demande()
        conflit = self._refuser_hors_brouillon(demande)
        if conflit is not None:
            return conflit

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(demande=demande)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=[TAG_PIECES],
        summary="Supprimer une pièce justificative",
        description="Rôle DISTRIBUTEUR. Supprime une pièce et son fichier. Uniquement en BROUILLON.",
        responses={
            204: OpenApiResponse(description="Pièce supprimée."),
            404: OpenApiResponse(description="Demande ou pièce introuvable."),
            409: OpenApiResponse(description=DEMANDE_NON_MODIFIABLE),
        },
    )
    def destroy(self, request, *args, **kwargs):
        demande = self._get_demande()
        conflit = self._refuser_hors_brouillon(demande)
        if conflit is not None:
            return conflit

        piece = get_object_or_404(PieceJustificative, pk=kwargs["pk"], demande=demande)
        piece.fichier.delete(save=False)
        piece.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
