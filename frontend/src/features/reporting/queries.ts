import { useQuery } from "@tanstack/react-query";

import { recupererReporting } from "../../api/reporting";

export const reportingKeys = {
  all: ["reporting"] as const,
};

export const useReporting = () => {
  return useQuery({
    queryKey: reportingKeys.all,
    queryFn: ({ signal }) => recupererReporting(signal),
  });
};
