from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers

from ..schema_docs import (
    DEMANDE_NON_TRAITABLE,
    TAG_ATTESTATION,
    TAG_FDR,
    TAG_PIECES,
    TAG_RISQUE,
    TAG_SIEGE,
    PiecesDossierSerializer,
)
from ..serializers import DemanderComplementsSerializer, EvaluationRisqueSerializer, RefuserDemandeSerializer
from ..serializers.attestation import AttestationSerializer, SiegeDemandeDetailSerializer

SIEGE_DEMANDE_VIEWSET = {
    "list": extend_schema(
        tags=[TAG_SIEGE],
        summary="Lister les demandes à traiter",
        description=(
            "Rôle SIÈGE. Liste paginée (10 par page) des demandes au statut EN_COURS, "
            "c'est-à-dire envoyées par les distributeurs et pas encore traitées. Les brouillons n'apparaissent pas."
        ),
    ),
    "retrieve": extend_schema(
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
}

PREPARER_ATTESTATION = {
    "tags": [TAG_ATTESTATION],
    "summary": "Préparer l'attestation définitive",
    "description": (
        "Rôle SIÈGE. Crée le brouillon d'attestation à partir du FDR, ou renvoie celui qui existe déjà "
        "(idempotent). Uniquement pour une demande EN_COURS sans décision. Sans corps de requête."
    ),
    "request": None,
    "responses": {
        201: OpenApiResponse(AttestationSerializer, description="Brouillon créé."),
        200: OpenApiResponse(AttestationSerializer, description="Brouillon déjà existant."),
        404: OpenApiResponse(description="Demande introuvable."),
        409: OpenApiResponse(description=DEMANDE_NON_TRAITABLE),
    },
}

ATTESTATION_GET = {
    "methods": ["GET"],
    "tags": [TAG_ATTESTATION],
    "summary": "Consulter le brouillon d'attestation",
    "description": "Rôle SIÈGE. Brouillon d'attestation préparé pour une demande EN_COURS sans décision.",
    "responses": {
        200: AttestationSerializer,
        404: OpenApiResponse(description="Demande introuvable ou attestation non préparée."),
        409: OpenApiResponse(description=DEMANDE_NON_TRAITABLE),
    },
}

ATTESTATION_PATCH = {
    "methods": ["PATCH"],
    "tags": [TAG_ATTESTATION],
    "summary": "Modifier le brouillon d'attestation",
    "description": (
        "Rôle SIÈGE. Met à jour `contenu_html` (HTML nettoyé côté serveur). Les autres champs sont en lecture "
        "seule. Uniquement pour une demande EN_COURS sans décision."
    ),
    "responses": {
        200: AttestationSerializer,
        404: OpenApiResponse(description="Demande introuvable ou attestation non préparée."),
        409: OpenApiResponse(description=DEMANDE_NON_TRAITABLE),
    },
}

ATTESTATION_PDF = {
    "tags": [TAG_ATTESTATION],
    "summary": "Prévisualiser le PDF de l'attestation",
    "description": (
        "Rôle SIÈGE. PDF de prévisualisation généré à la volée depuis le brouillon d'attestation ; "
        "ce n'est pas le document définitif."
    ),
    "responses": {
        (200, "application/pdf"): OpenApiTypes.BINARY,
        404: OpenApiResponse(description="Demande introuvable ou attestation non préparée."),
        409: OpenApiResponse(description=DEMANDE_NON_TRAITABLE),
    },
}

VALIDER_ATTESTATION = {
    "tags": [TAG_ATTESTATION],
    "summary": "Valider l'attestation définitive",
    "description": (
        "Rôle SIÈGE. Génère le PDF définitif à partir du brouillon, marque l'attestation comme validée, passe la "
        "demande à TRAITE avec la décision ACCEPTEE et notifie le distributeur, qui peut alors télécharger "
        "l'attestation. Action irréversible. Sans corps de requête."
    ),
    "request": None,
    "responses": {
        200: SiegeDemandeDetailSerializer,
        404: OpenApiResponse(description="Demande introuvable ou attestation non préparée."),
        409: OpenApiResponse(
            description="ATTESTATION_DEJA_VALIDEE, DEMANDE_NON_TRAITABLE ou ATTESTATION_VIDE (contenu vide)."
        ),
    },
}

ANALYSER_COHERENCE_ATTESTATION = {
    "tags": [TAG_ATTESTATION],
    "summary": "Contrôler la cohérence FDR / attestation",
    "description": (
        "Rôle SIÈGE. Aide à la vérification : compare le FDR et le brouillon d'attestation et signale les écarts "
        "(`anomalies`). Le résultat est indicatif ; il ne modifie ni l'attestation ni la demande, ne valide "
        "rien et ne décide pas de l'acceptation, qui reste une décision humaine. Non disponible une fois "
        "l'attestation validée. Sans corps de requête."
    ),
    "request": None,
    "responses": {
        200: inline_serializer(
            "AnalyseCoherence",
            {
                "coherent": serializers.BooleanField(),
                "resume": serializers.CharField(),
                "anomalies": serializers.ListField(
                    child=serializers.DictField(),
                    help_text="Champs : type, champ, valeur_fdr, valeur_attestation, message.",
                ),
            },
        ),
        404: OpenApiResponse(description="Demande introuvable ou attestation non préparée."),
        409: OpenApiResponse(description="DEMANDE_NON_TRAITABLE ou ATTESTATION_DEJA_VALIDEE."),
    },
}

DEMANDER_COMPLEMENTS = {
    "tags": [TAG_SIEGE],
    "summary": "Demander des compléments",
    "description": (
        "Rôle SIÈGE. Enregistre un message de demande de compléments et notifie le distributeur. La demande "
        "reste EN_COURS. Une seule demande de compléments non clôturée à la fois. Le traitement de la réponse "
        "du distributeur n'est pas géré par l'API."
    ),
    "request": DemanderComplementsSerializer,
    "responses": {
        201: SiegeDemandeDetailSerializer,
        400: OpenApiResponse(description="`message` vide ou absent."),
        404: OpenApiResponse(description="Demande introuvable."),
        409: OpenApiResponse(description="DEMANDE_NON_TRAITABLE ou COMPLEMENTS_DEJA_DEMANDES."),
    },
}

REFUSER = {
    "tags": [TAG_SIEGE],
    "summary": "Refuser une demande",
    "description": (
        "Rôle SIÈGE. Refuse la demande avec un motif obligatoire : passe à TRAITE avec la décision REFUSEE et "
        "notifie le distributeur en lui transmettant le motif. Action irréversible."
    ),
    "request": RefuserDemandeSerializer,
    "responses": {
        200: SiegeDemandeDetailSerializer,
        400: OpenApiResponse(description="`motif` vide ou absent."),
        404: OpenApiResponse(description="Demande introuvable."),
        409: OpenApiResponse(description=DEMANDE_NON_TRAITABLE),
    },
}

PIECES = {
    "tags": [TAG_PIECES],
    "summary": "Consulter les pièces justificatives",
    "description": (
        "Rôle SIÈGE. Pièces déposées pour une demande EN_COURS, catégories requises, catégories manquantes et "
        "`dossier_complet`. Le fichier se télécharge via l'endpoint dédié."
    ),
    "responses": {200: PiecesDossierSerializer, 404: OpenApiResponse(description="Demande introuvable ou non EN_COURS.")},
}

EVALUATION_RISQUE = {
    "tags": [TAG_RISQUE],
    "summary": "Consulter l'évaluation du risque",
    "description": (
        "Rôle SIÈGE. Score, niveau (faible, modere, eleve) et synthèse calculés à la volée à partir du FDR "
        "d'une demande EN_COURS. Indicateur d'aide à la décision : il ne décide pas de l'acceptation."
    ),
    "responses": {200: EvaluationRisqueSerializer, 404: OpenApiResponse(description="Demande introuvable ou non EN_COURS.")},
}

FDR_PDF = {
    "tags": [TAG_FDR],
    "summary": "Consulter le PDF du FDR",
    "description": "Rôle SIÈGE. PDF du FDR généré à l'envoi, pour une demande EN_COURS.",
    "responses": {
        (200, "application/pdf"): OpenApiTypes.BINARY,
        404: OpenApiResponse(description="Demande introuvable, non EN_COURS, ou PDF absent."),
    },
}

FICHIER = {
    "tags": [TAG_PIECES],
    "summary": "Télécharger une pièce justificative",
    "description": "Rôle SIÈGE. Fichier d'une pièce d'une demande EN_COURS (PDF, JPG ou PNG selon le dépôt).",
    "responses": {
        (200, "application/octet-stream"): OpenApiTypes.BINARY,
        404: OpenApiResponse(description="Demande non EN_COURS, ou pièce introuvable."),
    },
}
