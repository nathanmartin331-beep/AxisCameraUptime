// Reference: blueprint:javascript_log_in_with_replit for auth flow
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useStatusNotifications } from "@/hooks/useStatusNotifications";
import ErrorBoundary from "@/components/ErrorBoundary";
import Dashboard from "@/pages/Dashboard";
import CameraDetail from "@/pages/CameraDetail";
import Cameras from "@/pages/Cameras";
import NetworkScan from "@/pages/NetworkScan";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import CustomizableDashboard from "@/pages/CustomizableDashboard";
import Groups from "@/pages/Groups";
import GroupDetail from "@/pages/GroupDetail";
import Users from "@/pages/Users";
import NotFound from "@/pages/not-found";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LogOut, Sun, Moon, Bell } from "lucide-react";
import { useState } from "react";

function AppRouter() {
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
      <Route path="/users" component={Users} />
      <Route component={NotFound} />
    </Switch>
  );
}

function NotificationBell() {
  const { notifications, unreadCount, markAllRead } = useStatusNotifications();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) markAllRead(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative" data-testid="button-notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b">
          <p className="font-medium text-sm">Status Changes</p>
        </div>
        <div className="max-h-64 overflow-auto">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No recent status changes
            </div>
          ) : (
            notifications.slice(0, 10).map((n, i) => (
              <div key={i} className="px-3 py-2 border-b last:border-0 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{n.cameraName}</span>
                  <span className={`text-xs font-medium ${n.newStatus === "online" ? "text-green-600" : n.newStatus === "offline" ? "text-red-600" : "text-amber-600"}`}>
                    {n.newStatus}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(n.timestamp).toLocaleTimeString()}
                </p>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AppContent() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleTheme}
                  data-testid="button-theme-toggle"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
                <NotificationBell />
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
              <ErrorBoundary>
                <AppRouter />
              </ErrorBoundary>
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
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
