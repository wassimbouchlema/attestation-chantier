import { HeaderTitle } from "@axa-fr/canopee-react/distributeur";
import type { ReactNode } from "react";

export const PageHeader = ({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) => {
  return <HeaderTitle title={title} subtitle={subtitle} contentRight={actions} />;
};
