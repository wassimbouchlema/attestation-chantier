import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { DemandeDetail, FormulaireRisqueApi } from "../../api/demandes";
import { EditeurProjetAttestation } from "../../features/projetAttestation/components/EditeurProjetAttestation/EditeurProjetAttestation";
import { UTILISATEUR_DISTRIBUTEUR } from "../handlers";

const CORPS = "<p>AXA France atteste, sous réserve de validation définitive par le siège, que :</p>";

const FDR: FormulaireRisqueApi = {
  assure_nom: "AXA Construction",
  assure_ville: "Paris",
  assure_numero_contrat: "142511",
  chantier_nom: "Tour Horizon",
  chantier_ville: "Lyon",
  type_chantier: "NEUVE",
  modification_structure: null,
  chantier_atypique: false,
  usage: "BUREAU",
  usage_autre_texte: "",
  date_debut: "2026-01-10",
  date_fin: "2026-06-30",
  montant_total: "100000.00",
  intervention_description: "Rénovation complète",
  intervention_montant_prestation: "50000.00",
  intervention_type: "PRINCIPALE",
  activite_couverte: true,
  activite_non_couverte_texte: "",
  travaux_standards: true,
};

const DEMANDE: DemandeDetail = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  distributeur: 1,
  statut: "EN_COURS",
  created_at: "2026-09-10T08:00:00Z",
  updated_at: "2026-09-12T10:30:00Z",
  envoye_at: "2026-09-17T12:15:00Z",
  last_relance_at: null,
  commentaire_distributeur: "",
  fdr: FDR,
};

/**
 * Reproduit le scénario réel : le contenu n'est connu qu'après une résolution
 * asynchrone (le GET du projet), donc l'éditeur monte une fois que
 * `valeurInitiale` est déjà la vraie valeur — jamais avec une valeur par
 * défaut évaluée avant la fin du chargement.
 */
const ProjetChargeAsync = () => {
  const [contenu, setContenu] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    setTimeout(() => {
      if (!annule) setContenu(CORPS);
    }, 0);
    return () => {
      annule = true;
    };
  }, []);

  if (contenu === null) {
    return <p>Chargement…</p>;
  }
  return (
    <EditeurProjetAttestation
      demande={DEMANDE}
      agent={UTILISATEUR_DISTRIBUTEUR}
      valeurInitiale={contenu}
      onChange={vi.fn()}
    />
  );
};

describe("EditeurProjetAttestation — hydratation depuis un contenu asynchrone (Quill réel, non mocké)", () => {
  it("affiche le contenu HTML existant une fois arrivé, y compris sous React.StrictMode", async () => {
    render(
      <StrictMode>
        <ProjetChargeAsync />
      </StrictMode>,
    );

    expect(screen.getByText("Chargement…")).toBeInTheDocument();

    await waitFor(() => {
      expect(document.querySelector(".ql-editor")).toHaveTextContent(
        "AXA France atteste, sous réserve de validation définitive par le siège",
      );
    });

    // Un cleanup incomplet (effet rejoué mount→cleanup→mount) empilerait une
    // seconde barre d'outils ou des pickers dupliqués.
    expect(document.querySelectorAll(".ql-toolbar")).toHaveLength(1);
    expect(document.querySelectorAll(".ql-editor")).toHaveLength(1);
  });

  it("place la barre d'outils hors de la feuille : c'est un outil applicatif, pas une partie du document", async () => {
    render(<ProjetChargeAsync />);

    await waitFor(() => expect(document.querySelector(".ql-editor")).toBeInTheDocument());

    const feuille = document.querySelector(".projet-attestation-feuille");
    const barreOutils = document.querySelector(".ql-toolbar");
    expect(feuille).not.toBeNull();
    expect(barreOutils).not.toBeNull();
    expect(feuille?.contains(barreOutils as Node)).toBe(false);
    // La zone éditable, elle, fait bien partie du document.
    expect(feuille?.contains(document.querySelector(".ql-editor") as Node)).toBe(true);
  });

  it("porte les titres fixes et le pied de page dans la feuille, hors de la zone éditable", async () => {
    render(<ProjetChargeAsync />);

    await waitFor(() => expect(document.querySelector(".ql-editor")).toBeInTheDocument());

    const zoneEditable = document.querySelector(".ql-editor") as HTMLElement;
    for (const texte of [
      "Non définitif",
      "Attestation d'assurance",
      "Validation définitive : réservée au siège.",
    ]) {
      const element = screen.getByText(texte);
      expect(zoneEditable.contains(element)).toBe(false);
    }
  });
});
