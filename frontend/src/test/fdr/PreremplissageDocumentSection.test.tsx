import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import type { ResultatExtractionFdrApi } from "../../api/extraction";
import { AuthProvider } from "../../features/auth/AuthProvider";
import { FdrNouvelleDemandePage } from "../../pages/FdrNouvelleDemandePage/FdrNouvelleDemandePage";
import { createQueryClient } from "../../queryClient";
import { server } from "../server";
import { choisirVille, seedSession } from "../utils";

const renderPage = () =>
  render(
    <AuthProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/distributeur/demandes/nouvelle"]}>
          <Routes>
            <Route path="/distributeur" element={<p>Mes demandes (page)</p>} />
            <Route path="/distributeur/demandes/nouvelle" element={<FdrNouvelleDemandePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthProvider>,
  );

const RESULTAT_COMPLET: ResultatExtractionFdrApi = {
  assure_nom: { valeur: "Jean Dupont", confiance: 0.92, page: 1, extrait_source: "Assuré : Jean Dupont" },
  assure_ville: { valeur: "Paris", confiance: 0.85, page: null, extrait_source: null },
  assure_numero_contrat: { valeur: "1234567890123", confiance: 0.7, page: null, extrait_source: null },
  chantier_nom: { valeur: "Tour Horizon", confiance: 0.6, page: 2, extrait_source: null },
  chantier_ville: { valeur: "Lyon", confiance: 0.6, page: null, extrait_source: null },
  type_chantier: { valeur: "NEUVE", confiance: 0.75, page: null, extrait_source: null },
  usage: { valeur: "BUREAU", confiance: 0.55, page: null, extrait_source: null },
  usage_autre_texte: null,
  date_debut: { valeur: "2026-01-10", confiance: 0.8, page: 3, extrait_source: null },
  date_fin: { valeur: "2026-06-30", confiance: 0.8, page: 3, extrait_source: null },
  montant_total: { valeur: 500000, confiance: 0.65, page: 3, extrait_source: "Montant total : 500 000 €" },
  intervention_description: { valeur: "Rénovation complète", confiance: 0.5, page: null, extrait_source: null },
  intervention_montant_prestation: { valeur: 120000, confiance: 0.5, page: null, extrait_source: null },
  intervention_type: { valeur: "PRINCIPALE", confiance: 0.5, page: null, extrait_source: null },
  champs_non_trouves: ["usage_autre_texte"],
};

const RESULTAT_VIDE: ResultatExtractionFdrApi = {
  assure_nom: null,
  assure_ville: null,
  assure_numero_contrat: null,
  chantier_nom: null,
  chantier_ville: null,
  type_chantier: null,
  usage: null,
  usage_autre_texte: null,
  date_debut: null,
  date_fin: null,
  montant_total: null,
  intervention_description: null,
  intervention_montant_prestation: null,
  intervention_type: null,
  champs_non_trouves: [
    "assure_nom", "assure_ville", "assure_numero_contrat", "chantier_nom", "chantier_ville",
    "type_chantier", "usage", "usage_autre_texte", "date_debut", "date_fin", "montant_total",
    "intervention_description", "intervention_montant_prestation", "intervention_type",
  ],
};

const RESULTAT_COMPLET_B: ResultatExtractionFdrApi = {
  ...RESULTAT_VIDE,
  assure_nom: { valeur: "Marie Martin", confiance: 0.8, page: null, extrait_source: null },
  chantier_nom: { valeur: "Résidence B", confiance: 0.7, page: null, extrait_source: null },
  champs_non_trouves: RESULTAT_VIDE.champs_non_trouves.filter((c) => c !== "assure_nom" && c !== "chantier_nom"),
};

const fichierPdf = () => new File(["contenu"], "devis.pdf", { type: "application/pdf" });

const selectionnerFichier = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.upload(screen.getByLabelText("Document"), fichierPdf());
};

const analyser = async (user: ReturnType<typeof userEvent.setup>) => {
  await selectionnerFichier(user);
  await user.click(screen.getByRole("button", { name: "Analyser le document" }));
};

beforeEach(() => {
  seedSession("DISTRIBUTEUR");
});

describe("PreremplissageDocumentSection — affichage initial", () => {
  it("affiche le bloc au repos, au-dessus du stepper, sans aperçu ni bouton Analyser", async () => {
    renderPage();
    await screen.findByLabelText("Nom / raison sociale");

    const titre = screen.getByRole("heading", { name: "Préremplir depuis un document" });
    expect(titre).toBeInTheDocument();
    expect(
      screen.getByText(
        "Importez un devis, un marché ou un document de chantier au format PDF. Les informations détectées seront proposées avant d'être appliquées au formulaire.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Document")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Analyser le document" })).not.toBeInTheDocument();

    const stepper = screen.getByText("Informations").closest("ol, ul");
    expect(titre.compareDocumentPosition(stepper as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sélectionner un fichier fait apparaître Analyser sans lancer d'extraction", async () => {
    const user = userEvent.setup();
    let appels = 0;
    server.use(http.post("*/demandes/extraire-document/", () => {
      appels += 1;
      return HttpResponse.json(RESULTAT_VIDE);
    }));
    renderPage();
    await screen.findByLabelText("Nom / raison sociale");

    await selectionnerFichier(user);

    expect(await screen.findByRole("button", { name: "Analyser le document" })).toBeInTheDocument();
    expect(appels).toBe(0);
  });
});

describe("PreremplissageDocumentSection — extraction réussie", () => {
  it("envoie un POST multipart avec le champ document, affiche l'aperçu formaté et la confiance", async () => {
    const user = userEvent.setup();
    let formDataRecu: FormData | null = null;
    server.use(
      http.post("*/demandes/extraire-document/", async ({ request }) => {
        formDataRecu = await request.formData();
        return HttpResponse.json(RESULTAT_COMPLET);
      }),
    );
    renderPage();
    await screen.findByLabelText("Nom / raison sociale");

    await analyser(user);

    expect(await screen.findByText("Jean Dupont")).toBeInTheDocument();
    expect(formDataRecu).not.toBeNull();
    expect((formDataRecu as unknown as FormData).get("document")).toBeTruthy();

    expect(screen.getByText("92 %")).toBeInTheDocument();
    expect(screen.getByText("10/01/2026")).toBeInTheDocument();
    expect(screen.getByText("30/06/2026")).toBeInTheDocument();
    expect(screen.getByText(/500\s*000,00\s*€/)).toBeInTheDocument();
    expect(screen.getByText("Construction neuve")).toBeInTheDocument();
    expect(screen.getByText("Bureau")).toBeInTheDocument();
    expect(screen.getByText("Entreprise principale")).toBeInTheDocument();

    expect(screen.getAllByText("Voir la source")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Appliquer au formulaire" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ignorer" })).toBeInTheDocument();

    const stepper = screen.getByText("Informations").closest("ol, ul") as Node;
    const apercu = screen.getByText("Jean Dupont");
    expect(stepper.compareDocumentPosition(apercu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("affiche l'état de chargement pendant l'extraction", async () => {
    const user = userEvent.setup();
    let resoudre: (reponse: Response) => void = () => {};
    server.use(
      http.post(
        "*/demandes/extraire-document/",
        () => new Promise<Response>((resolve) => {
          resoudre = resolve;
        }),
      ),
    );
    renderPage();
    await screen.findByLabelText("Nom / raison sociale");
    await selectionnerFichier(user);

    await user.click(screen.getByRole("button", { name: "Analyser le document" }));

    const boutonEnCours = await screen.findByRole("button", { name: "Analyse du document…" });
    expect(boutonEnCours).toBeDisabled();

    resoudre(HttpResponse.json(RESULTAT_VIDE));
    await screen.findByText("Aucune information n'a pu être détectée dans ce document.");
  });

  it("aucune information trouvée : message dédié, pas de bouton Appliquer", async () => {
    const user = userEvent.setup();
    server.use(http.post("*/demandes/extraire-document/", () => HttpResponse.json(RESULTAT_VIDE)));
    renderPage();
    await screen.findByLabelText("Nom / raison sociale");

    await analyser(user);

    expect(await screen.findByText("Aucune information n'a pu être détectée dans ce document.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Appliquer au formulaire" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nom / raison sociale")).toBeEnabled();
  });

  it("Ignorer n'applique rien et réinitialise le bloc", async () => {
    const user = userEvent.setup();
    server.use(http.post("*/demandes/extraire-document/", () => HttpResponse.json(RESULTAT_COMPLET)));
    renderPage();
    await screen.findByLabelText("Nom / raison sociale");

    await analyser(user);
    await screen.findByText("Jean Dupont");

    await user.click(screen.getByRole("button", { name: "Ignorer" }));

    expect(screen.queryByText("Jean Dupont")).not.toBeInTheDocument();
    expect((screen.getByLabelText("Nom / raison sociale") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("button", { name: "Analyser le document" })).not.toBeInTheDocument();
  });
});

describe("PreremplissageDocumentSection — application au formulaire", () => {
  it(
    "remplit les champs vides, conserve les valeurs déjà saisies, laisse les questions métier intactes",
    async () => {
      const user = userEvent.setup();
      server.use(http.post("*/demandes/extraire-document/", () => HttpResponse.json(RESULTAT_COMPLET)));
      renderPage();
      await screen.findByLabelText("Nom / raison sociale");

      await user.type(screen.getByLabelText("Nom / raison sociale"), "AXA Existant");

      await analyser(user);
      await screen.findByText("Tour Horizon");
      await user.click(screen.getByRole("button", { name: "Appliquer au formulaire" }));

      expect(await screen.findByText("12 informations complétées.")).toBeInTheDocument();
      expect(screen.getByText("1 informations déjà renseignées conservées.")).toBeInTheDocument();
      expect((screen.getByLabelText("Nom / raison sociale") as HTMLInputElement).value).toBe("AXA Existant");

      await user.click(screen.getByRole("button", { name: "Valider" }));
      await screen.findByLabelText("Nom du chantier");
      expect((screen.getByLabelText("Nom du chantier") as HTMLInputElement).value).toBe("Tour Horizon");

      await user.click(within(screen.getByRole("radiogroup", { name: "Chantier atypique ?" })).getByLabelText("Non"));
      await user.click(screen.getByRole("button", { name: "Valider" }));

      // Usage & calendrier et Intervention étaient déjà entièrement remplis
      // par l'extraction avant même ce clic : `calculerEtatsSections` les
      // détecte valides sans action de l'utilisateur et saute directement à
      // la première section réellement incomplète (Questions métier, dont
      // aucun champ n'est extractible).
      await screen.findByText("L'activité est-elle couverte par le contrat ?");
      expect(screen.getByText("Rénovation complète")).toBeInTheDocument();

      const activite = screen.getByRole("radiogroup", { name: "L'activité est-elle couverte par le contrat ?" });
      const travaux = screen.getByRole("radiogroup", { name: "Les travaux sont-ils standards ?" });
      expect(within(activite).queryByRole("radio", { checked: true })).not.toBeInTheDocument();
      expect(within(travaux).queryByRole("radio", { checked: true })).not.toBeInTheDocument();
    },
    15000,
  );
});

describe("PreremplissageDocumentSection — réinitialisation du préremplissage", () => {
  it("après Appliquer, le document est verrouillé et Réinitialiser le préremplissage est proposé", async () => {
    const user = userEvent.setup();
    server.use(http.post("*/demandes/extraire-document/", () => HttpResponse.json(RESULTAT_COMPLET)));
    renderPage();
    await screen.findByLabelText("Nom / raison sociale");

    await analyser(user);
    await screen.findByText("Jean Dupont");
    await user.click(screen.getByRole("button", { name: "Appliquer au formulaire" }));

    expect(await screen.findByText("13 informations complétées.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Parcourir" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Analyser le document" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réinitialiser le préremplissage" })).toBeInTheDocument();
  });

  it(
    "Réinitialiser retire les valeurs encore identiques à celles appliquées, conserve les valeurs modifiées ou préexistantes, et nettoie l'état d'extraction",
    async () => {
      const user = userEvent.setup();
      server.use(http.post("*/demandes/extraire-document/", () => HttpResponse.json(RESULTAT_COMPLET)));
      renderPage();
      await screen.findByLabelText("Nom / raison sociale");

      await user.type(screen.getByLabelText("Nom / raison sociale"), "AXA Existant");
      await analyser(user);
      await screen.findByText("Tour Horizon");
      await user.click(screen.getByRole("button", { name: "Appliquer au formulaire" }));
      await screen.findByText("12 informations complétées.");

      const champNumero = screen.getByLabelText("Numéro de contrat") as HTMLInputElement;
      expect(champNumero.value).toBe("1234567890123");
      await user.clear(champNumero);
      await user.type(champNumero, "9999999999999");

      await user.click(screen.getByRole("button", { name: "Réinitialiser le préremplissage" }));

      expect((screen.getByLabelText("Nom / raison sociale") as HTMLInputElement).value).toBe("AXA Existant");
      expect((screen.getByLabelText("Numéro de contrat") as HTMLInputElement).value).toBe("9999999999999");

      expect(screen.queryByText("12 informations complétées.")).not.toBeInTheDocument();
      expect(screen.queryByText("Tour Horizon")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Informations détectées" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Parcourir" })).toBeEnabled();

      // `assure_ville` avait été appliqué (champ vide) puis réinitialisé à "" :
      // Valider échoue et reste sur Assuré plutôt que d'avancer vers Chantier.
      await user.click(screen.getByRole("button", { name: "Valider" }));
      expect(screen.queryByLabelText("Nom du chantier")).not.toBeInTheDocument();
    },
    15000,
  );

  it(
    "un champ métier non extractible renseigné manuellement survit à la réinitialisation même quand sa section redevient incomplète",
    async () => {
      const user = userEvent.setup();
      server.use(http.post("*/demandes/extraire-document/", () => HttpResponse.json(RESULTAT_COMPLET)));
      renderPage();
      await screen.findByLabelText("Nom / raison sociale");

      await analyser(user);
      await screen.findByText("Tour Horizon");
      await user.click(screen.getByRole("button", { name: "Appliquer au formulaire" }));
      await screen.findByText("13 informations complétées.");

      await user.click(screen.getByRole("button", { name: "Valider" }));
      await screen.findByLabelText("Nom du chantier");
      await user.click(within(screen.getByRole("radiogroup", { name: "Chantier atypique ?" })).getByLabelText("Oui"));

      await user.click(screen.getByRole("button", { name: "Réinitialiser le préremplissage" }));

      // Rien n'a été modifié manuellement à part ce radio (non extractible) :
      // tous les champs appliqués reviennent vides, y compris ceux d'Assuré
      // déjà validé — le wizard retombe donc sur la première section
      // redevenue incomplète, plutôt que de rester sur Chantier.
      await screen.findByLabelText("Nom / raison sociale");
      expect(screen.queryByLabelText("Nom du chantier")).not.toBeInTheDocument();

      await user.type(screen.getByLabelText("Nom / raison sociale"), "AXA Construction");
      await choisirVille(user, "Paris");
      await user.type(screen.getByLabelText("Numéro de contrat"), "1234567890123");
      await user.click(screen.getByRole("button", { name: "Valider" }));

      await screen.findByLabelText("Nom du chantier");
      expect(
        within(screen.getByRole("radiogroup", { name: "Chantier atypique ?" })).getByLabelText("Oui"),
      ).toBeChecked();
    },
    15000,
  );

  it(
    "réinitialiser recalcule l'état du stepper : les sections auto-validées par le préremplissage ne restent jamais cochées avec des champs vidés",
    async () => {
      const user = userEvent.setup();
      server.use(http.post("*/demandes/extraire-document/", () => HttpResponse.json(RESULTAT_COMPLET)));
      renderPage();
      await screen.findByLabelText("Nom / raison sociale");

      await analyser(user);
      await screen.findByText("Tour Horizon");
      await user.click(screen.getByRole("button", { name: "Appliquer au formulaire" }));
      await screen.findByText("13 informations complétées.");

      await user.click(screen.getByRole("button", { name: "Valider" }));
      await screen.findByLabelText("Nom du chantier");
      await user.click(within(screen.getByRole("radiogroup", { name: "Chantier atypique ?" })).getByLabelText("Non"));
      await user.click(screen.getByRole("button", { name: "Valider" }));

      // Usage & calendrier et Intervention sont désormais en restitution,
      // avec les vraies valeurs extraites (pas de undefined/0,00 €).
      await screen.findByText("L'activité est-elle couverte par le contrat ?");
      expect(screen.getByText(/500\s*000,00\s*€/)).toBeInTheDocument();
      expect(screen.getByText("Rénovation complète")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Réinitialiser le préremplissage" }));

      // Aucune section ne doit rester affichée avec des données vidées.
      expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
      expect(screen.queryByText("0,00 €")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Nom du chantier")).not.toBeInTheDocument();
      expect(screen.queryByText("L'activité est-elle couverte par le contrat ?")).not.toBeInTheDocument();

      // Le wizard retombe sur Assuré, seule section encore mentionnée.
      expect(await screen.findByLabelText("Nom / raison sociale")).toHaveValue("");

      // Un second document peut ensuite être importé, analysé puis appliqué.
      server.use(http.post("*/demandes/extraire-document/", () => HttpResponse.json(RESULTAT_COMPLET_B)));
      await analyser(user);
      await screen.findByText("Marie Martin");
      await user.click(screen.getByRole("button", { name: "Appliquer au formulaire" }));

      expect((screen.getByLabelText("Nom / raison sociale") as HTMLInputElement).value).toBe("Marie Martin");
    },
    15000,
  );

  it("un second document peut être analysé et appliqué après réinitialisation", async () => {
    const user = userEvent.setup();
    server.use(http.post("*/demandes/extraire-document/", () => HttpResponse.json(RESULTAT_COMPLET)));
    renderPage();
    await screen.findByLabelText("Nom / raison sociale");

    await analyser(user);
    await screen.findByText("Jean Dupont");
    await user.click(screen.getByRole("button", { name: "Appliquer au formulaire" }));
    await screen.findByText("13 informations complétées.");

    await user.click(screen.getByRole("button", { name: "Réinitialiser le préremplissage" }));
    expect(screen.getByRole("button", { name: "Parcourir" })).toBeEnabled();

    server.use(http.post("*/demandes/extraire-document/", () => HttpResponse.json(RESULTAT_COMPLET_B)));
    await analyser(user);
    await screen.findByText("Marie Martin");
    await user.click(screen.getByRole("button", { name: "Appliquer au formulaire" }));

    expect((screen.getByLabelText("Nom / raison sociale") as HTMLInputElement).value).toBe("Marie Martin");
  });
});

describe("PreremplissageDocumentSection — erreurs", () => {
  it("400 : message dédié, saisie manuelle toujours possible", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/demandes/extraire-document/", () =>
        HttpResponse.json({ document: ["Le document est vide."] }, { status: 400 }),
      ),
    );
    renderPage();
    await screen.findByLabelText("Nom / raison sociale");

    await analyser(user);

    expect(
      await screen.findByText("Ce fichier ne peut pas être analysé. Vérifiez qu'il s'agit bien d'un PDF."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nom / raison sociale")).toBeEnabled();
  });

  it("503 : message dédié, distinct d'un résultat vide", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/demandes/extraire-document/", () =>
        HttpResponse.json({ code: "EXTRACTION_INDISPONIBLE", detail: "Service en panne." }, { status: 503 }),
      ),
    );
    renderPage();
    await screen.findByLabelText("Nom / raison sociale");

    await analyser(user);

    expect(
      await screen.findByText(
        "Le service d'extraction est momentanément indisponible. Vous pouvez réessayer ou continuer en saisie manuelle.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Aucune information n'a pu être détectée dans ce document.")).not.toBeInTheDocument();
  });

  it("erreur réseau : message générique existant du projet", async () => {
    const user = userEvent.setup();
    server.use(http.post("*/demandes/extraire-document/", () => HttpResponse.error()));
    renderPage();
    await screen.findByLabelText("Nom / raison sociale");

    await analyser(user);

    expect(await screen.findByText("Une erreur est survenue. Veuillez réessayer.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nom / raison sociale")).toBeEnabled();
  });
});
