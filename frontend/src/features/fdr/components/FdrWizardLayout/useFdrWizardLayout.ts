import { useLayoutEffect, useRef } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useParams } from "react-router-dom";

import { ErreurDemandeIntrouvable } from "../../../../api/demandes";
import { messageErreurAffichable } from "../../../demandes/helpers/messageErreur";
import { useDemande } from "../../../demandes/queries";
import { versFormValues } from "../../helpers/versFormValues";
import { fdrInformationsSchema } from "../../schemas/fdrInformationsSchema";
import { FDR_FORM_VALEURS_VIDES, type FdrFormValues } from "../../types/FdrFormValues";

/**
 * Orchestration du shell FDR : charge la Demande (avec son FDR imbriqué),
 * initialise un unique FormProvider, l'hydrate une seule fois par id.
 *
 * Hydratation volontairement ponctuelle (pas `values:` réactif) : reset()
 * une seule fois par id de demande, gardé par une ref. Un refetch TanStack
 * ultérieur (ex. retour d'onglet — refetchOnWindowFocus n'est pas désactivé
 * dans queryClient.ts) ne doit jamais écraser silencieusement les
 * modifications locales de l'utilisateur.
 *
 * `useLayoutEffect` (pas `useEffect`) est essentiel ici : d'autres hooks
 * (ex. useFdrInformationsPage) lisent `methods.getValues()` dans leur propre
 * effet passif dès le premier montage, en s'appuyant sur le fait que ce
 * reset() a déjà été appliqué avant qu'un seul effet passif de l'arbre ne
 * s'exécute. Ne pas changer ce timing.
 */
export const useFdrWizardLayout = () => {
  const { id } = useParams<{ id: string }>();
  const { data: demande, isLoading, isError, error } = useDemande(id);

  const methods = useForm<FdrFormValues>({
    resolver: zodResolver(fdrInformationsSchema),
    defaultValues: FDR_FORM_VALEURS_VIDES,
  });

  const idHydrateRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (demande && idHydrateRef.current !== demande.id) {
      methods.reset(versFormValues(demande.fdr));
      idHydrateRef.current = demande.id;
    }
  }, [demande, methods]);

  return {
    demande,
    isLoading,
    isError,
    introuvable: error instanceof ErreurDemandeIntrouvable,
    erreurAffichable: error ? messageErreurAffichable(error) : null,
    methods,
  };
};
