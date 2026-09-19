import { HeaderTitle } from "@axa-fr/canopee-react/distributeur";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import "./PageHeader.css";
import { usePageHeader } from "./usePageHeader";

export const PageHeader = ({
  title,
  subtitle,
  actions,
  sansAccueil = false,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  sansAccueil?: boolean;
}) => {
  const { accueil } = usePageHeader();

  return (
    <HeaderTitle
      title={title}
      subtitle={subtitle}
      contentRight={actions}
      contentLeft={
        sansAccueil ? undefined : (
          <Link to={accueil} className="btn af-btn--circle page-header__accueil" aria-label="Retour à l'accueil">
            <i className="glyphicon glyphicon-home" aria-hidden="true" />
          </Link>
        )
      }
    />
  );
};
