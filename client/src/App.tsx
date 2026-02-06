// Reference: blueprint:javascript_log_in_with_replit for auth flow
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import Dashboard from "@/pages/Dashboard";
import CameraDetail from "@/pages/CameraDetail";
import Cameras from "@/pages/Cameras";
import NetworkScan from "@/pages/NetworkScan";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import CustomizableDashboard from "@/pages/CustomizableDashboard";
import Groups from "@/pages/Groups";
import GroupDetail from "@/pages/GroupDetail";
import NotFound from "@/pages/not-found";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/cameras" component={Cameras} />
      <Route path="/cameras/:id" component={CameraDetail} />
      <Route path="/scan" component={NetworkScan} />
      <Route path="/reports" component={Reports} />
      <Route path="/settings" component={Settings} />
      <Route path="/custom-dashboard" component={CustomizableDashboard} />
      <Route path="/groups" component={Groups} />
      <Route path="/groups/:id" component={GroupDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const style = {
    "--sidebar-width": "16rem",
  };

  // Show loading spinner while authentication is in progress
  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">
            {isLoading ? "Initializing..." : "Authenticating..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1">
            <header className="flex items-center justify-between p-4 border-b">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {(user as any)?.firstName || (user as any)?.email || "User"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                    await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
                    window.location.href = "/";
                  }}
                  data-testid="button-logout"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </div>
            </header>
            <main className="flex-1 overflow-auto p-8">
              <Router />
            </main>
          </div>
        </div>
      </SidebarProvider>
      <Toaster />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
