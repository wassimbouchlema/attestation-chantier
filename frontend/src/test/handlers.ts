import { http, HttpResponse } from "msw";

import type { Utilisateur } from "../api/auth";
import type { Demande, DemandesPaginees, DemandesPagineesDetail, FormulaireRisqueApi } from "../api/demandes";
import type { EvaluationRisqueApi } from "../api/evaluationRisque";
import type { NotificationsResponseApi } from "../api/notifications";
import type { PiecesResponseApi } from "../api/pieces";

export const UTILISATEUR_DISTRIBUTEUR: Utilisateur = {
  id: 1,
  username: "distributeur_test",
  first_name: "Jean",
  last_name: "Dupont",
  role: "DISTRIBUTEUR",
};

export const UTILISATEUR_SIEGE: Utilisateur = {
  id: 2,
  username: "siege_test",
  first_name: "Alice",
  last_name: "Martin",
  role: "SIEGE",
};

const UTILISATEURS_PAR_TOKEN: Record<string, Utilisateur> = {
  "access-token-distributeur": UTILISATEUR_DISTRIBUTEUR,
  "access-token-siege": UTILISATEUR_SIEGE,
};

const TOKENS_PAR_UTILISATEUR: Record<string, { access: string; refresh: string }> = {
  distributeur_test: { access: "access-token-distributeur", refresh: "refresh-token-distributeur" },
  siege_test: { access: "access-token-siege", refresh: "refresh-token-siege" },
};

const ACCESS_PAR_REFRESH: Record<string, string> = {
  "refresh-token-distributeur": "access-token-distributeur",
  "refresh-token-siege": "access-token-siege",
};

export const handlers = [
  http.post("*/auth/login/", async ({ request }) => {
    const { username, password } = (await request.json()) as { username: string; password: string };
    const tokens = TOKENS_PAR_UTILISATEUR[username];
    if (!tokens || password !== "test1234") {
      return new HttpResponse(null, { status: 401 });
    }
    return HttpResponse.json(tokens);
  }),

  http.get("*/auth/me/", ({ request }) => {
    const token = (request.headers.get("authorization") ?? "").replace("Bearer ", "");
    const utilisateur = UTILISATEURS_PAR_TOKEN[token];
    if (!utilisateur) {
      return new HttpResponse(null, { status: 401 });
    }
    return HttpResponse.json(utilisateur);
  }),

  http.post("*/auth/refresh/", async ({ request }) => {
    const { refresh } = (await request.json()) as { refresh: string };
    const access = ACCESS_PAR_REFRESH[refresh];
    if (!access) {
      return new HttpResponse(null, { status: 401 });
    }
    return HttpResponse.json({ access });
  }),

  // Placés AVANT les handlers /demandes/ ci-dessous : leur préfixe `*` matcherait
  // aussi ces URLs (`/siege/demandes/...` contient `/demandes/...`), et MSW
  // retient le premier handler qui matche.
  http.get("*/siege/demandes/", () => {
    const reponse: DemandesPagineesDetail = { count: 0, next: null, previous: null, results: [] };
    return HttpResponse.json(reponse);
  }),

  http.get("*/notifications/", () => {
    const reponse: NotificationsResponseApi = { non_vues: 0, notifications: [] };
    return HttpResponse.json(reponse);
  }),

  // Handlers par défaut "neutres" pour /demandes/ : les tests qui inspectent
  // réellement le contenu de la liste/détail les remplacent via server.use().
  http.get("*/demandes/", () => {
    const reponse: DemandesPaginees = { count: 0, next: null, previous: null, results: [] };
    return HttpResponse.json(reponse);
  }),

  http.get("*/demandes/:id/", ({ params }) => {
    const fdr: FormulaireRisqueApi = {
      assure_nom: "",
      assure_ville: "",
      assure_numero_contrat: "",
      chantier_nom: "",
      chantier_ville: "",
      type_chantier: "",
      modification_structure: null,
      chantier_atypique: null,
      usage: "",
      usage_autre_texte: "",
      date_debut: null,
      date_fin: null,
      montant_total: null,
      intervention_description: "",
      intervention_montant_prestation: null,
      intervention_type: "",
      activite_couverte: null,
      activite_non_couverte_texte: "",
      travaux_standards: null,
    };
    const demande: Demande & { commentaire_distributeur: string; fdr: FormulaireRisqueApi } = {
      id: params.id as string,
      distributeur: 1,
      statut: "BROUILLON",
      created_at: "2026-09-16T09:00:00Z",
      updated_at: "2026-09-16T09:00:00Z",
      envoye_at: null,
      last_relance_at: null,
      commentaire_distributeur: "",
      fdr,
    };
    return HttpResponse.json(demande);
  }),

  http.post("*/demandes/", () => {
    const demande: Demande = {
      id: "11111111-1111-4111-8111-111111111111",
      distributeur: 1,
      statut: "BROUILLON",
      created_at: "2026-09-16T09:00:00Z",
      updated_at: "2026-09-16T09:00:00Z",
      envoye_at: null,
      last_relance_at: null,
    };
    return HttpResponse.json(demande, { status: 201 });
  }),

  http.get("*/demandes/:id/pieces/", () => {
    const reponse: PiecesResponseApi = {
      pieces: [],
      pieces_requises: [],
      pieces_manquantes: [],
      dossier_complet: true,
    };
    return HttpResponse.json(reponse);
  }),

  http.get("*/demandes/:id/evaluation-risque/", () => {
    const reponse: EvaluationRisqueApi = {
      score: 0,
      niveau: "faible",
      synthese: "Aucun facteur de risque significatif n'a été identifié par l'évaluation automatique indicative.",
    };
    return HttpResponse.json(reponse);
  }),

  // Par défaut, aucun projet d'attestation n'existe encore (404 = état
  // normal) : les tests qui en créent un le remplacent via server.use().
  http.get("*/demandes/:id/projet-attestation/", () => new HttpResponse(null, { status: 404 })),
];

const COMMUNES_TEST = [
  { nom: "Paris", codesPostaux: ["75001", "75002"] },
  { nom: "Lyon", codesPostaux: ["69001"] },
  { nom: "Saint-Denis", codesPostaux: ["93200"] },
  { nom: "Saint-Denis", codesPostaux: ["97400"] },
];

export const communesHandlers = [
  http.get("https://geo.api.gouv.fr/communes", ({ request }) => {
    const nom = (new URL(request.url).searchParams.get("nom") ?? "").toLowerCase();
    return HttpResponse.json(COMMUNES_TEST.filter((commune) => commune.nom.toLowerCase().includes(nom)));
  }),
];
