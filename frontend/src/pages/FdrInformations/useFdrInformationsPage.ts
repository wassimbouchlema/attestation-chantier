import { useEffect, useRef, useState } from "react";

import { useFormContext } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import type { DemandeDetail } from "../../api/demandes";
import { messageErreurAffichable } from "../../features/demandes/helpers/messageErreur";
import { CHAMPS_PAR_SECTION, ORDRE_SECTIONS, type SectionId } from "../../features/fdr/constants/sections";
import { calculerEtatsSections } from "../../features/fdr/helpers/calculerEtatsSections";
import { versPayloadApi } from "../../features/fdr/helpers/versPayloadApi";
import { useMettreAJourFdr } from "../../features/fdr/queries";
import type { EtatSection } from "../../features/fdr/types/EtatSection";
import type { FdrFormValues } from "../../features/fdr/types/FdrFormValues";
import { useDocumentTitle } from "../../layout/useDocumentTitle";

/**
 * Orchestration de l'étape Informations : quelle section est active/validée,
 * hydratation/reprise d'un brouillon, et le flux de confirmation globale.
 * Aucune state machine — un useState minimal suffit, la validation elle-même
 * (trigger + Zod) reste portée par chaque section.
 */
export const useFdrInformationsPage = (demande: DemandeDetail) => {
  const navigate = useNavigate();
  const lectureSeule = demande.statut !== "BROUILLON";
  const methods = useFormContext<FdrFormValues>();
  const mettreAJourFdrMutation = useMettreAJourFdr(demande.id);

  useDocumentTitle("Informations — Formulaire de déclaration du risque");

  const [sectionActive, setSectionActive] = useState<SectionId | null>(null);
  const [sectionsValidees, setSectionsValidees] = useState<Set<SectionId>>(new Set());
  const [erreurValidationGlobale, setErreurValidationGlobale] = useState(false);
  // Ref (pas useState) : la lecture/le nettoyage se font uniquement dans un
  // effet, sans jamais devoir déclencher de rendu supplémentaire pour ça.
  const champAFocuserRef = useRef<keyof FdrFormValues | null>(null);

  // Initialise l'état des sections une seule fois, à partir des données
  // réellement présentes dans le FDR — jamais en rejouant artificiellement le
  // parcours de création. `useEffect` (pas `useLayoutEffect`) est essentiel
  // ici : tous les effets de mise en page de l'arbre (dont le `reset()` de
  // FdrWizardLayout, qui hydrate ce même FormProvider) se terminent avant
  // qu'un seul effet passif ne s'exécute, donc `methods.getValues()` reflète
  // déjà les données hydratées au moment où cet effet se déclenche — même sur
  // le tout premier montage. Gardé par une ref sur l'id de la demande : ne se
  // relance jamais sur une frappe, et ignoré en lecture seule (forcée
  // "validee" par `etatDe`, quel que soit le contenu de `sectionsValidees`).
  const demandeInitialiseeRef = useRef<string | null>(null);
  useEffect(() => {
    if (lectureSeule || demandeInitialiseeRef.current === demande.id) {
      return;
    }
    demandeInitialiseeRef.current = demande.id;
    const { sectionsValides, premiereSectionInvalide } = calculerEtatsSections(methods.getValues());
    setSectionsValidees(new Set(sectionsValides));
    setSectionActive(premiereSectionInvalide);
  }, [demande.id, lectureSeule, methods]);

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

  // Focus différé : le champ ciblé n'est monté qu'une fois la section rouverte
  // (modifierSection fait passer son formulaire de "restitution" à "form").
  // Ref plutôt que state pour la cible à focuser : sa lecture/son nettoyage
  // n'ont besoin de déclencher aucun rendu, seul le changement de section
  // (déjà un state) doit redéclencher cet effet.
  useEffect(() => {
    if (champAFocuserRef.current && sectionActive) {
      methods.setFocus(champAFocuserRef.current);
      champAFocuserRef.current = null;
    }
  }, [sectionActive, methods]);

  const confirmerInformations = async () => {
    const estValide = await methods.trigger();
    const toutesSectionsValidees = sectionsValidees.size === ORDRE_SECTIONS.length;

    if (!estValide || !toutesSectionsValidees) {
      // Deux causes distinctes peuvent bloquer la confirmation, et ne sont
      // pas seulement théoriques :
      // 1. Un champ est réellement invalide — y compris une incohérence
      //    croisée révélée après coup (ex. Intervention, prestation <
      //    montant_total) si l'utilisateur rouvre puis modifie une section
      //    précédente sans que cela invalide automatiquement une section
      //    suivante déjà collapsée.
      // 2. Toutes les valeurs sont techniquement valides, mais une section
      //    ouverte via "Modifier" n'a pas encore été reconfirmée par son
      //    propre bouton local "Valider" — ce bouton garde son sens métier,
      //    la confirmation globale ne doit pas s'y substituer silencieusement.
      //
      // `methods.formState.errors` est un piège classique RHF ici : ce Proxy
      // n'est mis à jour que pour les champs déjà "lus" pendant un rendu — or
      // ce hook ne le lit jamais pendant un rendu (chaque section gère ses
      // propres erreurs). `getErrors()` lit l'état interne réel, sans ce
      // piège de souscription ("Get all currently stored form errors without
      // subscribing").
      const errors = methods.getErrors();
      const sectionEnErreur = ORDRE_SECTIONS.find((section) =>
        CHAMPS_PAR_SECTION[section].some((champ) => errors[champ]),
      );
      const sectionAOuvrir = sectionEnErreur ?? ORDRE_SECTIONS.find((section) => !sectionsValidees.has(section));

      if (sectionAOuvrir) {
        // Recalcule l'ensemble à partir des données réelles (et non par
        // simple ajout/retrait) : une section suivante peut, elle aussi,
        // être devenue invalide entre-temps — elle ne doit jamais rester
        // affichée "validated" à tort au moment de cette confirmation.
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
    mettreAJourFdrMutation.mutate(versPayloadApi(methods.getValues()), {
      onSuccess: () => navigate(`/distributeur/demandes/${demande.id}/pieces`),
    });
  };

  return {
    lectureSeule,
    etatDe,
    modifierSection,
    validerSection,
    erreurValidationGlobale,
    fermerErreurValidationGlobale: () => setErreurValidationGlobale(false),
    erreurConfirmation: mettreAJourFdrMutation.isError ? messageErreurAffichable(mettreAJourFdrMutation.error) : null,
    fermerErreurConfirmation: () => mettreAJourFdrMutation.reset(),
    confirmationEnCours: mettreAJourFdrMutation.isPending,
    confirmerInformations,
    retournerAuxDemandes: () => navigate("/distributeur"),
  };
};
