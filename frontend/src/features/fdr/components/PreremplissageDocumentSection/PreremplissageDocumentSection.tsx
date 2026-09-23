import { Button, FileInput, Message } from "@axa-fr/canopee-react/distributeur";

import type { ChampExtractibleFdr } from "../../../../api/extraction";
import { Surface } from "../../../../layout/Surface";
import { OPTIONS_INTERVENTION_TYPE } from "../../constants/optionsInterventionType";
import { OPTIONS_TYPE_CHANTIER } from "../../constants/optionsTypeChantier";
import { OPTIONS_USAGE } from "../../constants/optionsUsage";
import { formatDateFr } from "../../helpers/formatDateFr";
import { formatMontant } from "../../helpers/formatMontant";
import type { ChampPreremplissageFdr } from "../../helpers/depuisResultatExtraction";
import type { usePreremplissageDocumentSection } from "./usePreremplissageDocumentSection";
import "./PreremplissageDocumentSection.css";

const ACCEPT_DOCUMENT = ".pdf,application/pdf";

const LIBELLES_CHAMPS_EXTRAITS: Record<ChampExtractibleFdr, string> = {
  assure_nom: "Nom de l'assuré",
  assure_ville: "Ville de l'assuré",
  assure_numero_contrat: "Numéro de contrat",
  chantier_nom: "Nom du chantier",
  chantier_ville: "Ville du chantier",
  type_chantier: "Type de chantier",
  usage: "Usage",
  usage_autre_texte: "Précisions sur l'usage",
  date_debut: "Date de début",
  date_fin: "Date de fin",
  montant_total: "Montant total du chantier",
  intervention_description: "Description de l'intervention",
  intervention_montant_prestation: "Montant de la prestation",
  intervention_type: "Type d'intervention",
};

const libelleOption = (options: { value: string; label: string }[], valeur: string): string =>
  options.find((option) => option.value === valeur)?.label ?? valeur;

const formaterValeurChamp = (champ: ChampExtractibleFdr, valeur: string): string => {
  switch (champ) {
    case "date_debut":
    case "date_fin":
      return formatDateFr(valeur);
    case "montant_total":
    case "intervention_montant_prestation":
      return formatMontant(valeur);
    case "type_chantier":
      return libelleOption(OPTIONS_TYPE_CHANTIER, valeur);
    case "usage":
      return libelleOption(OPTIONS_USAGE, valeur);
    case "intervention_type":
      return libelleOption(OPTIONS_INTERVENTION_TYPE, valeur);
    default:
      return valeur;
  }
};

type PagePreremplissage = ReturnType<typeof usePreremplissageDocumentSection>;

export const PreremplissageDocumentUpload = ({ page }: { page: PagePreremplissage }) => (
  <Surface className="preremplissage-document">
    <section aria-labelledby="titre-preremplissage" aria-busy={page.analyseEnCours}>
      <h2 id="titre-preremplissage">Préremplir depuis un document</h2>
      <p className="preremplissage-document__aide">
        Importez un devis, un marché ou un document de chantier au format PDF. Les informations détectées seront
        proposées avant d'être appliquées au formulaire.
      </p>

      <FileInput
        id={page.idChampFichier}
        label="Document"
        labelPosition="top"
        fileLabel="Parcourir"
        values={page.valeursFichier}
        errors={page.erreursNavigateur}
        accept={ACCEPT_DOCUMENT}
        multiple={false}
        maxSize={Number.MAX_SAFE_INTEGER}
        disabled={page.analyseEnCours || page.preremplissageApplique}
        onChange={page.handleChangeFichier}
      />

      {page.fichierSelectionne && !page.resultatDisponible && (
        <Button variant="secondary" onClick={page.analyser} disabled={page.analyseEnCours}>
          {page.analyseEnCours ? "Analyse du document…" : "Analyser le document"}
        </Button>
      )}

      <div aria-live="polite">
        {page.erreurExtraction && <Message variant="error" title={page.erreurExtraction} />}

        {page.resultatDisponible && page.aucuneInformationTrouvee && (
          <Message variant="info" title="Aucune information n'a pu être détectée dans ce document." />
        )}

        {page.resumeApplication && (
          <Message variant="success" title={`${page.resumeApplication.completes} informations complétées.`}>
            {page.resumeApplication.conservees > 0 && (
              <p>{page.resumeApplication.conservees} informations déjà renseignées conservées.</p>
            )}
            <p>Le préremplissage a été appliqué. Réinitialisez-le pour utiliser un autre document.</p>
            <Button variant="secondary" onClick={page.reinitialiserPreremplissage}>
              Réinitialiser le préremplissage
            </Button>
          </Message>
        )}
      </div>
    </section>
  </Surface>
);

const ChampDetecteApercu = ({ champDetecte }: { champDetecte: ChampPreremplissageFdr }) => (
  <div className="preremplissage-document__champ">
    <span className="preremplissage-document__label">{LIBELLES_CHAMPS_EXTRAITS[champDetecte.champ]}</span>
    <span className="preremplissage-document__ligne">
      <span className="preremplissage-document__valeur">
        {formaterValeurChamp(champDetecte.champ, champDetecte.valeurFormulaire)}
      </span>
      <span className="preremplissage-document__confiance">{Math.round(champDetecte.confiance * 100)} %</span>
    </span>
    {(champDetecte.page !== null || champDetecte.extraitSource !== null) && (
      <details className="preremplissage-document__source">
        <summary>Voir la source</summary>
        {champDetecte.page !== null && <p>Page {champDetecte.page}</p>}
        {champDetecte.extraitSource !== null && <p>« {champDetecte.extraitSource} »</p>}
      </details>
    )}
  </div>
);

export const PreremplissageDocumentApercu = ({ page }: { page: PagePreremplissage }) => {
  if (!page.resultatDisponible || page.champsDetectes.length === 0 || page.resumeApplication) {
    return null;
  }

  return (
    <Surface className="preremplissage-document-apercu">
      <section aria-label="Informations détectées dans le document">
        <div className="preremplissage-document-apercu__entete">
          <h2>Informations détectées</h2>
          <p>{page.champsDetectes.length} informations détectées</p>
        </div>
        <div className="preremplissage-document__grille">
          {page.champsDetectes.map((champDetecte) => (
            <ChampDetecteApercu key={champDetecte.champ} champDetecte={champDetecte} />
          ))}
        </div>
        <div className="preremplissage-document__actions">
          <Button variant="primary" onClick={page.appliquer}>
            Appliquer au formulaire
          </Button>
          <Button variant="secondary" onClick={page.ignorer}>
            Ignorer
          </Button>
        </div>
      </section>
    </Surface>
  );
};
