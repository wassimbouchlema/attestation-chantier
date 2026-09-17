import { useState } from "react";

import { Button, MandatoryMention } from "@axa-fr/canopee-react/distributeur";
import { useNavigate, useOutletContext } from "react-router-dom";

import { AssureSection } from "../../features/fdr/components/AssureSection/AssureSection";
import { ChantierSection } from "../../features/fdr/components/ChantierSection/ChantierSection";
import { InterventionSection } from "../../features/fdr/components/InterventionSection/InterventionSection";
import { QuestionsMetierSection } from "../../features/fdr/components/QuestionsMetierSection/QuestionsMetierSection";
import { UsageCalendrierSection } from "../../features/fdr/components/UsageCalendrierSection/UsageCalendrierSection";
import type { EtatSection } from "../../features/fdr/types/EtatSection";
import type { FdrOutletContext } from "../../features/fdr/types/FdrOutletContext";
import { useDocumentTitle } from "../../layout/useDocumentTitle";

const ORDRE_SECTIONS = ["assure", "chantier", "usage", "intervention", "questions"] as const;
type SectionId = (typeof ORDRE_SECTIONS)[number];

/**
 * Orchestration uniquement : quelle section est active/validée. Aucune
 * state machine — un useState minimal suffit, la validation elle-même
 * (trigger + Zod) reste portée par chaque section. Les 5 sections sont
 * toujours montées (VerticalStep, frères directs pour sa ligne verticale
 * CSS) ; seuls `etat`/`readonly` (calculés ici) changent leur rendu. En
 * lecture seule (EN_COURS/TRAITE), toutes sont forcées "validee" + readonly.
 */
export const FdrInformationsPage = () => {
  const { demande } = useOutletContext<FdrOutletContext>();
  const navigate = useNavigate();
  const lectureSeule = demande.statut !== "BROUILLON";

  useDocumentTitle("Informations — Formulaire de déclaration du risque");

  const [sectionActive, setSectionActive] = useState<SectionId | null>(lectureSeule ? null : "assure");
  const [sectionsValidees, setSectionsValidees] = useState<Set<SectionId>>(new Set());

  const validerSection = (section: SectionId) => {
    setSectionsValidees((precedent) => new Set(precedent).add(section));
    const indexSuivant = ORDRE_SECTIONS.indexOf(section) + 1;
    setSectionActive(ORDRE_SECTIONS[indexSuivant] ?? null);
  };

  const modifierSection = (section: SectionId) => {
    setSectionsValidees((precedent) => {
      const suivant = new Set(precedent);
      suivant.delete(section);
      return suivant;
    });
    setSectionActive(section);
  };

  const etatDe = (section: SectionId): EtatSection => {
    if (lectureSeule || sectionsValidees.has(section)) {
      return "validee";
    }
    return sectionActive === section ? "active" : "a_venir";
  };

  const parcoursTermine = sectionsValidees.size === ORDRE_SECTIONS.length;

  return (
    <>
      {!lectureSeule && <MandatoryMention variant="one" />}

      <AssureSection
        etat={etatDe("assure")}
        readonly={lectureSeule}
        onValide={() => validerSection("assure")}
        onModifier={() => modifierSection("assure")}
      />
      <ChantierSection
        etat={etatDe("chantier")}
        readonly={lectureSeule}
        onValide={() => validerSection("chantier")}
        onModifier={() => modifierSection("chantier")}
      />
      <UsageCalendrierSection
        etat={etatDe("usage")}
        readonly={lectureSeule}
        onValide={() => validerSection("usage")}
        onModifier={() => modifierSection("usage")}
      />
      <InterventionSection
        etat={etatDe("intervention")}
        readonly={lectureSeule}
        onValide={() => validerSection("intervention")}
        onModifier={() => modifierSection("intervention")}
      />
      <QuestionsMetierSection
        etat={etatDe("questions")}
        readonly={lectureSeule}
        onValide={() => validerSection("questions")}
        onModifier={() => modifierSection("questions")}
      />

      {!lectureSeule && (
        <div className="fdr-actions-globales">
          <Button variant="secondary" onClick={() => navigate("/distributeur")}>
            Retour à mes demandes
          </Button>
          {/*
            Ne fait encore aucun PATCH ni navigation : le branchement réel
            (validation complète -> PATCH FDR -> navigation Pièces) sera
            ajouté avec la carte qui développe l'étape Pièces.
          */}
          <Button variant="primary" disabled={!parcoursTermine}>
            Confirmer les informations
          </Button>
        </div>
      )}
    </>
  );
};
