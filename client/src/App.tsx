import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import Landing from "@/pages/landing";
import AdminPage from "@/pages/admin";
import Tech from "@/pages/tech";
import Outage from "@/pages/outage";
import NotFound from "@/pages/not-found";\r\nimport Help from "@/pages/help";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/tech" component={Tech} />
      <Route path="/outage" component={Outage} />
      <Route path="/admin" component={AdminPage} />\r\n      <Route path="/help" component={Help} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-center" richColors />
      <Router />
    </QueryClientProvider>
  );
}

export default App;


