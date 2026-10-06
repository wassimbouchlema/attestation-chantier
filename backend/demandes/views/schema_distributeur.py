from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    inline_serializer,
)

from ..models import DecisionDemande, StatutDemande
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
from .filtres_demande import DECISION_EN_ATTENTE, FILTRES_COMPLEMENTS

DEMANDE_VIEWSET = {
    "list": extend_schema(
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
    "retrieve": extend_schema(
        tags=[TAG_DEMANDES],
        summary="Consulter une demande",
        description=(
            "Rôle DISTRIBUTEUR. Détail d'une de ses demandes : statut, décision, FDR, commentaire, motif de refus "
            "éventuel et demande de compléments non clôturée (`complement_actif`)."
        ),
        responses={200: DemandeDetailSerializer, 404: OpenApiResponse(description=DEMANDE_INTROUVABLE)},
    ),
}

CREATE = {
    "tags": [TAG_DEMANDES],
    "summary": "Créer une demande (brouillon)",
    "description": (
        "Rôle DISTRIBUTEUR. Crée une demande au statut BROUILLON avec son FDR. Le FDR fourni dans `fdr` doit être "
        "complet et valide dès la création (mêmes règles qu'à l'envoi) ; sinon rien n'est créé."
    ),
    "request": inline_serializer("DemandeCreation", {"fdr": FormulaireRisqueSerializer()}),
    "responses": {
        201: DemandeDetailSerializer,
        400: OpenApiResponse(description="FDR_INVALIDE : `erreurs` liste un message par champ en erreur."),
    },
}

EXTRAIRE_DOCUMENT = {
    "tags": [TAG_FDR],
    "summary": "Extraire un FDR depuis un document (préremplissage)",
    "description": (
        "Rôle DISTRIBUTEUR. Upload multipart d'un document PDF unique. Extrait les informations "
        "explicitement présentes dans le document pour proposer un préremplissage du FDR. Ne crée "
        "et ne modifie aucune donnée : le résultat est à vérifier et compléter avant toute création "
        "de demande via l'endpoint de création habituel."
    ),
    "request": ExtractionDocumentSerializer,
    "responses": {
        200: OpenApiResponse(description="Résultat structuré de l'extraction (ResultatExtractionFdr)."),
        400: OpenApiResponse(description="Document absent, vide, ou type non supporté (PDF uniquement)."),
        503: OpenApiResponse(description="EXTRACTION_INDISPONIBLE : service d'extraction momentanément indisponible."),
    },
}

DESTROY = {
    "tags": [TAG_DEMANDES],
    "summary": "Supprimer un brouillon",
    "description": (
        "Rôle DISTRIBUTEUR. Supprime définitivement un brouillon, avec ses pièces justificatives. "
        "Impossible dès que la demande a été envoyée."
    ),
    "responses": {
        204: OpenApiResponse(description="Brouillon supprimé."),
        404: OpenApiResponse(description=DEMANDE_INTROUVABLE),
        409: OpenApiResponse(description=DEMANDE_NON_MODIFIABLE),
    },
}

FDR_GET = {
    "methods": ["GET"],
    "tags": [TAG_FDR],
    "summary": "Consulter le FDR",
    "description": "Rôle DISTRIBUTEUR. Formulaire de risque (FDR) de sa demande, quel que soit le statut.",
    "responses": {200: FormulaireRisqueSerializer, 404: OpenApiResponse(description=DEMANDE_INTROUVABLE)},
}

FDR_PATCH = {
    "methods": ["PATCH"],
    "tags": [TAG_FDR],
    "summary": "Modifier le FDR (brouillon)",
    "description": (
        "Rôle DISTRIBUTEUR. Mise à jour partielle : seuls les champs fournis sont modifiés et un FDR incomplet "
        "est accepté. Règles vérifiées : précision obligatoire si usage AUTRE ou activité non couverte, "
        "date de fin postérieure à la date de début, montant de prestation inférieur au montant total. "
        "`modification_structure` est remis à null si le chantier n'est pas une rénovation."
    ),
    "responses": {
        200: FormulaireRisqueSerializer,
        400: OpenApiResponse(description="Champ invalide, par champ."),
        404: OpenApiResponse(description=DEMANDE_INTROUVABLE),
        409: OpenApiResponse(description=DEMANDE_NON_MODIFIABLE),
    },
}

EVALUATION_RISQUE = {
    "tags": [TAG_RISQUE],
    "summary": "Consulter l'évaluation du risque",
    "description": (
        "Rôle DISTRIBUTEUR. Score, niveau (faible, modere, eleve) et synthèse calculés à la volée à partir du FDR "
        "courant. Indicateur d'aide : il ne constitue pas une décision."
    ),
    "responses": {200: EvaluationRisqueSerializer, 404: OpenApiResponse(description=DEMANDE_INTROUVABLE)},
}

COMMENTAIRE = {
    "tags": [TAG_DEMANDES],
    "summary": "Modifier le commentaire du distributeur",
    "description": (
        "Rôle DISTRIBUTEUR. Enregistre le commentaire joint à la demande. Modifiable uniquement en BROUILLON ; "
        "il peut aussi être fourni à l'envoi."
    ),
    "responses": {
        200: CommentaireDistributeurSerializer,
        404: OpenApiResponse(description=DEMANDE_INTROUVABLE),
        409: OpenApiResponse(description=DEMANDE_NON_MODIFIABLE),
    },
}

FDR_PDF = {
    "tags": [TAG_FDR],
    "summary": "Consulter le PDF du FDR",
    "description": (
        "Rôle DISTRIBUTEUR. PDF du FDR généré à l'envoi de la demande ; il n'existe donc pas pour un brouillon."
    ),
    "responses": {
        (200, "application/pdf"): OpenApiTypes.BINARY,
        404: OpenApiResponse(description="Aucun PDF généré (demande non envoyée) ou demande introuvable."),
    },
}

ATTESTATION_FINALE_PDF = {
    "tags": [TAG_ATTESTATION],
    "summary": "Télécharger l'attestation définitive",
    "description": (
        "Rôle DISTRIBUTEUR. PDF de l'attestation définitive, disponible uniquement lorsque la demande a été "
        "acceptée par le SIÈGE et l'attestation validée."
    ),
    "responses": {
        (200, "application/pdf"): OpenApiTypes.BINARY,
        404: OpenApiResponse(description="Demande non acceptée, attestation non validée ou demande introuvable."),
    },
}

ENVOYER = {
    "tags": [TAG_DEMANDES],
    "summary": "Valider et envoyer la demande au SIÈGE",
    "description": (
        "Rôle DISTRIBUTEUR. Contrôle la complétude du FDR et des pièces justificatives requises, génère le PDF "
        "du FDR, passe la demande de BROUILLON à EN_COURS et notifie le SIÈGE. `commentaire_distributeur` "
        "est facultatif et remplace le commentaire enregistré."
    ),
    "request": EnvoyerDemandeSerializer,
    "responses": {
        200: DemandeDetailSerializer,
        400: OpenApiResponse(
            description="FDR_INVALIDE (`erreurs` par champ) ou DOSSIER_INCOMPLET (`pieces_manquantes`)."
        ),
        404: OpenApiResponse(description=DEMANDE_INTROUVABLE),
        409: OpenApiResponse(description=DEMANDE_NON_MODIFIABLE),
        500: OpenApiResponse(description="Compte SIÈGE introuvable ou ambigu (configuration serveur)."),
    },
}

RELANCER = {
    "tags": [TAG_DEMANDES],
    "summary": "Relancer le SIÈGE",
    "description": (
        "Rôle DISTRIBUTEUR. Envoie un email de relance au SIÈGE et crée une notification pour une demande "
        "EN_COURS. Une seule relance par période de 24 h ; `prochaine_relance_at` indique la prochaine date "
        "possible. Sans corps de requête."
    ),
    "request": None,
    "responses": {
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
}

PROJET_ATTESTATION_GET = {
    "methods": ["GET"],
    "tags": [TAG_ATTESTATION],
    "summary": "Consulter le projet d'attestation",
    "description": "Rôle DISTRIBUTEUR. Texte (HTML nettoyé) du projet d'attestation de sa demande.",
    "responses": {
        200: ProjetAttestationSerializer,
        404: OpenApiResponse(description="Aucun projet d'attestation ou demande introuvable."),
    },
}

PROJET_ATTESTATION_POST = {
    "methods": ["POST"],
    "tags": [TAG_ATTESTATION],
    "summary": "Créer le projet d'attestation",
    "description": (
        "Rôle DISTRIBUTEUR. Génère le contenu initial du projet à partir du FDR. Uniquement pour une demande "
        "EN_COURS ; un seul projet par demande. Sans corps de requête."
    ),
    "request": None,
    "responses": {
        201: ProjetAttestationSerializer,
        404: OpenApiResponse(description=DEMANDE_INTROUVABLE),
        409: OpenApiResponse(description="PROJET_NON_AUTORISE (demande non EN_COURS) ou PROJET_DEJA_EXISTANT."),
    },
}

PROJET_ATTESTATION_PATCH = {
    "methods": ["PATCH"],
    "tags": [TAG_ATTESTATION],
    "summary": "Modifier le projet d'attestation",
    "description": (
        "Rôle DISTRIBUTEUR. Met à jour `contenu_html` ; le HTML est nettoyé côté serveur. "
        "Uniquement tant que la demande est EN_COURS."
    ),
    "responses": {
        200: ProjetAttestationSerializer,
        404: OpenApiResponse(description="Aucun projet d'attestation ou demande introuvable."),
        409: OpenApiResponse(description="Demande n'étant plus EN_COURS."),
    },
}

PROJET_ATTESTATION_PDF = {
    "tags": [TAG_ATTESTATION],
    "summary": "Télécharger le PDF du projet d'attestation",
    "description": "Rôle DISTRIBUTEUR. PDF généré à la volée à partir du projet d'attestation enregistré.",
    "responses": {
        (200, "application/pdf"): OpenApiTypes.BINARY,
        404: OpenApiResponse(description="Aucun projet d'attestation ou demande introuvable."),
    },
}

PIECE_LIST = {
    "tags": [TAG_PIECES],
    "summary": "Lister les pièces justificatives",
    "description": (
        "Rôle DISTRIBUTEUR. Pièces déposées, catégories requises d'après le FDR (`pieces_requises`), "
        "catégories manquantes et indicateur `dossier_complet`."
    ),
    "responses": {200: PiecesDossierSerializer, 404: OpenApiResponse(description=DEMANDE_INTROUVABLE)},
}

PIECE_CREATE = {
    "tags": [TAG_PIECES],
    "summary": "Ajouter une pièce justificative",
    "description": (
        "Rôle DISTRIBUTEUR. Dépose un fichier (multipart) pour une catégorie : structure, usage, complexite, "
        "montant, activite ou travaux. Formats acceptés : PDF, JPG, PNG. Uniquement en BROUILLON."
    ),
    "responses": {
        201: PieceJustificativeSerializer,
        400: OpenApiResponse(description="Catégorie inconnue ou type de fichier non autorisé."),
        404: OpenApiResponse(description=DEMANDE_INTROUVABLE),
        409: OpenApiResponse(description=DEMANDE_NON_MODIFIABLE),
    },
}

PIECE_DESTROY = {
    "tags": [TAG_PIECES],
    "summary": "Supprimer une pièce justificative",
    "description": "Rôle DISTRIBUTEUR. Supprime une pièce et son fichier. Uniquement en BROUILLON.",
    "responses": {
        204: OpenApiResponse(description="Pièce supprimée."),
        404: OpenApiResponse(description="Demande ou pièce introuvable."),
        409: OpenApiResponse(description=DEMANDE_NON_MODIFIABLE),
    },
}
