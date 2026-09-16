import { AuthProvider } from "./features/auth/AuthProvider";
import { AppRouter } from "./routes/AppRouter";

const App = () => {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
};

export default App;
