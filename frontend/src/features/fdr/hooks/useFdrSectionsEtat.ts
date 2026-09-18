import { useEffect, useRef, useState } from "react";

import type { UseFormReturn } from "react-hook-form";

import { CHAMPS_PAR_SECTION, ORDRE_SECTIONS, type SectionId } from "../constants/sections";
import { calculerEtatsSections } from "../helpers/calculerEtatsSections";
import type { EtatSection } from "../types/EtatSection";
import type { FdrFormValues } from "../types/FdrFormValues";

export const useFdrSectionsEtat = ({
  identifiant,
  lectureSeule,
  methods,
}: {
  identifiant: string;
  lectureSeule: boolean;
  methods: UseFormReturn<FdrFormValues>;
}) => {
  const [sectionActive, setSectionActive] = useState<SectionId | null>(null);
  const [sectionsValidees, setSectionsValidees] = useState<Set<SectionId>>(new Set());
  const [erreurValidationGlobale, setErreurValidationGlobale] = useState(false);
  const champAFocuserRef = useRef<keyof FdrFormValues | null>(null);

  const identifiantInitialiseRef = useRef<string | null>(null);
  useEffect(() => {
    if (lectureSeule || identifiantInitialiseRef.current === identifiant) {
      return;
    }
    identifiantInitialiseRef.current = identifiant;
    const { sectionsValides, premiereSectionInvalide } = calculerEtatsSections(methods.getValues());
    setSectionsValidees(new Set(sectionsValides));
    setSectionActive(premiereSectionInvalide);
  }, [identifiant, lectureSeule, methods]);

  const validerSection = () => {
    const { sectionsValides, premiereSectionInvalide } = calculerEtatsSections(methods.getValues());
    setSectionsValidees(new Set(sectionsValides));
    setSectionActive(premiereSectionInvalide);
    setErreurValidationGlobale(false);
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

  useEffect(() => {
    if (champAFocuserRef.current && sectionActive) {
      methods.setFocus(champAFocuserRef.current);
      champAFocuserRef.current = null;
    }
  }, [sectionActive, methods]);

  const verifierEtValider = async (onValide: () => void) => {
    const estValide = await methods.trigger();
    const toutesSectionsValidees = sectionsValidees.size === ORDRE_SECTIONS.length;

    if (!estValide || !toutesSectionsValidees) {
      const errors = methods.getErrors();
      const sectionEnErreur = ORDRE_SECTIONS.find((section) =>
        CHAMPS_PAR_SECTION[section].some((champ) => errors[champ]),
      );
      const sectionAOuvrir = sectionEnErreur ?? ORDRE_SECTIONS.find((section) => !sectionsValidees.has(section));

      if (sectionAOuvrir) {
        const { sectionsValides } = calculerEtatsSections(methods.getValues());
        setSectionsValidees(new Set(sectionsValides.filter((section) => section !== sectionAOuvrir)));
        setSectionActive(sectionAOuvrir);
        if (sectionEnErreur) {
          champAFocuserRef.current = CHAMPS_PAR_SECTION[sectionEnErreur].find((champ) => errors[champ]) ?? null;
        }
      }
      setErreurValidationGlobale(true);
      return;
    }

    setErreurValidationGlobale(false);
    onValide();
  };

  return {
    etatDe,
    modifierSection,
    validerSection,
    erreurValidationGlobale,
    fermerErreurValidationGlobale: () => setErreurValidationGlobale(false),
    verifierEtValider,
  };
};
