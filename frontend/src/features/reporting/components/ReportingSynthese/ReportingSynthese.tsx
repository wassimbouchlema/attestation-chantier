import { Button, Title, type TagVariants } from "@axa-fr/canopee-react/distributeur";

import { Surface } from "../../../../layout/Surface";
import { VARIANT_STATUT } from "../../../demandes/constants/statutLabel";
import { useReporting } from "../../queries";
import "./ReportingSynthese.css";

const VALEUR_EN_ATTENTE = "–";

interface Segment {
  cle: "brouillons" | "en_cours" | "acceptees" | "refusees";
  libelle: string;
  variant: TagVariants;
}

const SEGMENTS: Segment[] = [
  { cle: "brouillons", libelle: "Brouillons", variant: VARIANT_STATUT.BROUILLON },
  { cle: "en_cours", libelle: "En cours", variant: VARIANT_STATUT.EN_COURS },
  { cle: "acceptees", libelle: "Acceptées", variant: "success" },
  { cle: "refusees", libelle: "Refusées", variant: "error" },
];

export const ReportingSynthese = ({ inclureBrouillons = false }: { inclureBrouillons?: boolean }) => {
  const { data, isLoading, isError, refetch } = useReporting();

  const indicateurs = [
    { libelle: "Demandes", valeur: data?.total },
    { libelle: "En cours", valeur: data?.en_cours },
    { libelle: "Acceptées", valeur: data?.acceptees },
    { libelle: "Refusées", valeur: data?.refusees },
  ];

  const segments = SEGMENTS.filter(({ cle }) => inclureBrouillons || cle !== "brouillons");

  return (
    <section aria-labelledby="reporting-synthese-titre" aria-busy={isLoading}>
      <Surface>
        <Title heading="h2" id="reporting-synthese-titre">
          Synthèse des demandes
        </Title>

        {isError ? (
          <div role="alert" className="reporting-synthese__erreur">
            <p>Impossible de charger la synthèse des demandes.</p>
            <Button variant="secondary" onClick={() => refetch()}>
              Réessayer
            </Button>
          </div>
        ) : (
          <>
            <dl className="reporting-synthese__indicateurs">
              {indicateurs.map(({ libelle, valeur }) => (
                <div key={libelle} className="reporting-synthese__indicateur">
                  <dt className="reporting-synthese__libelle">{libelle}</dt>
                  <dd className="reporting-synthese__valeur">{valeur ?? VALEUR_EN_ATTENTE}</dd>
                </div>
              ))}
            </dl>

            {data &&
              (data.total === 0 ? (
                <p className="reporting-synthese__vide">Aucune demande</p>
              ) : (
                <>
                  <div aria-hidden="true" className="reporting-synthese__barre">
                    {segments
                      .filter(({ cle }) => data[cle] > 0)
                      .map(({ cle, variant }) => (
                        <span
                          key={cle}
                          className={`reporting-synthese__segment reporting-synthese__segment--${variant}`}
                          style={{ flexGrow: data[cle] }}
                        />
                      ))}
                  </div>
                  <ul aria-label="Répartition des demandes" className="reporting-synthese__legende">
                    {segments.map(({ cle, libelle, variant }) => (
                      <li key={cle} className="reporting-synthese__legende-item">
                        <span aria-hidden="true" className={`reporting-synthese__pastille reporting-synthese__segment--${variant}`} />
                        {libelle} : {data[cle]}
                      </li>
                    ))}
                  </ul>
                </>
              ))}
          </>
        )}
      </Surface>
    </section>
  );
};
