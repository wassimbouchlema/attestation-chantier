from datetime import timedelta

from django.core.files.base import ContentFile
from django.core.mail import EmailMessage
from django.db import transaction
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from comptes.permissions import IsDistributeur
from comptes.services import ErreurConfigurationSiege, obtenir_compte_siege_unique

from .evaluation_risque import calculer_evaluation_risque
from .models import Demande, FormulaireRisque, Notification, PieceJustificative, StatutDemande, TypeNotification
from .pdf import generer_pdf_fdr
from .rules import calculer_pieces_manquantes, calculer_pieces_requises
from .serializers import (
    CommentaireDistributeurSerializer,
    DemandeDetailSerializer,
    DemandeSerializer,
    EnvoyerDemandeSerializer,
    EvaluationRisqueSerializer,
    FormulaireRisqueSerializer,
    MarquerNotificationsVuesSerializer,
    NotificationSerializer,
    PieceJustificativeSerializer,
)
from .validation_envoi import valider_fdr_pret_a_envoyer

TITRE_DEMANDE_ENVOYEE = "Nouvelle demande reçue"
MESSAGE_DEMANDE_ENVOYEE = "Une nouvelle demande d'attestation de chantier a été envoyée."

TITRE_RELANCE = "Demande relancée"
MESSAGE_RELANCE = "Le distributeur a relancé une demande en cours de traitement."

DELAI_RELANCE = timedelta(hours=24)


class DemandePagination(PageNumberPagination):
    page_size = 10


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
        return DemandeSerializer

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

    @action(detail=True, methods=["get"], url_path="evaluation-risque")
    def evaluation_risque(self, request, pk=None):
        demande = self.get_object()
        serializer = self.get_serializer(calculer_evaluation_risque(demande.fdr))
        return Response(serializer.data)

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
                # Nettoyage explicite du seul fichier créé pendant cette tentative :
                # transaction.atomic() protège la DB, jamais le storage/filesystem.
                if demande.fdr_pdf:
                    demande.fdr_pdf.delete(save=False)
                raise

        return Response(DemandeDetailSerializer(demande).data, status=status.HTTP_200_OK)

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

            # L'email fait foi : `last_relance_at`/la notification ne sont
            # enregistrés que s'il a réellement été envoyé par le backend
            # configuré (fail_silently=False) — une exception de transport
            # annule la transaction, aucune "fausse" relance n'est persistée.
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

    def create(self, request, *args, **kwargs):
        demande = self._get_demande()
        conflit = self._refuser_hors_brouillon(demande)
        if conflit is not None:
            return conflit

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(demande=demande)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        demande = self._get_demande()
        conflit = self._refuser_hors_brouillon(demande)
        if conflit is not None:
            return conflit

        piece = get_object_or_404(PieceJustificative, pk=kwargs["pk"], demande=demande)
        piece.fichier.delete(save=False)
        piece.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(destinataire=self.request.user)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        non_vues = queryset.filter(seen_at__isnull=True).count()
        serializer = self.get_serializer(queryset, many=True)
        return Response({"non_vues": non_vues, "notifications": serializer.data})

    @action(detail=False, methods=["post"], url_path="marquer-vues")
    def marquer_vues(self, request):
        entree = MarquerNotificationsVuesSerializer(data=request.data)
        entree.is_valid(raise_exception=True)

        # GET ne doit jamais avoir d'effet de bord (pas de seen_at=now() implicite
        # au refetch/focus TanStack Query) : seule cette action batch marque des
        # notifications comme vues, et strictement celles du demandeur — un id
        # étranger fourni volontairement est silencieusement filtré, sans fuite
        # d'information sur son existence/propriétaire réel.
        nombre_marquees = Notification.objects.filter(
            destinataire=request.user,
            id__in=entree.validated_data["ids"],
            seen_at__isnull=True,
        ).update(seen_at=timezone.now())

        return Response({"marquees": nombre_marquees}, status=status.HTTP_200_OK)
