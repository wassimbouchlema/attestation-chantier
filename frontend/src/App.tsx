import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { AuthProvider } from "./features/auth/AuthProvider";
import { createQueryClient } from "./queryClient";
import { AppRouter } from "./routes/AppRouter";

const App = () => {
  const [queryClient] = useState(createQueryClient);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <AppRouter />
      </QueryClientProvider>
    </AuthProvider>
  );
};

export default App;
