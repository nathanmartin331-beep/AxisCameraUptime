import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { Bell, Clock, Database, User, Lock, AlertTriangle, Loader2, Save, Shield } from "lucide-react";
import ApiKeysSection from "@/components/settings/ApiKeysSection";
import WebhooksSection from "@/components/settings/WebhooksSection";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

interface UserSettingsData {
  id: string;
  userId: string;
  pollingInterval: number | null;
  dataRetentionDays: number | null;
  emailNotifications: boolean | null;
  defaultCertValidationMode: string | null;
  globalCaCert: string | null;
}

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pollingInterval, setPollingInterval] = useState("5");
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [dataRetention, setDataRetention] = useState("90");
  const [isSaving, setIsSaving] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [defaultCertMode, setDefaultCertMode] = useState("none");
  const [globalCaCert, setGlobalCaCert] = useState("");

  // Profile editing state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Load settings from API
  const { data: settings, isLoading: settingsLoading } = useQuery<UserSettingsData>({
    queryKey: ["/api/settings"],
  });

  // Sync local state when settings load
  useEffect(() => {
    if (settings) {
      setPollingInterval(String(settings.pollingInterval ?? 5));
      setEmailNotifications(settings.emailNotifications ?? false);
      setDataRetention(String(settings.dataRetentionDays ?? 90));
      setDefaultCertMode(settings.defaultCertValidationMode ?? "none");
      setGlobalCaCert(settings.globalCaCert ?? "");
    }
  }, [settings]);

  // Sync profile fields when user data loads
  useEffect(() => {
    if (user) {
      setFirstName((user as any)?.firstName || "");
      setLastName((user as any)?.lastName || "");
    }
  }, [user]);

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      const data: Record<string, string> = {};
      if (firstName) data.firstName = firstName;
      if (lastName) data.lastName = lastName;
      await apiRequest("PATCH", "/api/auth/me", data);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Profile Updated",
        description: "Your profile has been saved",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to Update Profile",
        description: error.message || "Please try again",
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await apiRequest("PATCH", "/api/settings", {
        pollingInterval: parseInt(pollingInterval),
        dataRetentionDays: parseInt(dataRetention),
        emailNotifications,
        defaultCertValidationMode: defaultCertMode,
        globalCaCert: globalCaCert || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings Saved",
        description: "Your preferences have been updated",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to Save Settings",
        description: error.message || "Please try again",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunCleanup = async () => {
    setIsCleaningUp(true);
    try {
      const response = await apiRequest("POST", "/api/admin/cleanup");
      const data = await response.json();
      toast({
        title: "Cleanup Complete",
        description: data.message || "Old data has been removed",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Cleanup Failed",
        description: error.message || "Please try again",
      });
    } finally {
      setIsCleaningUp(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Password Mismatch",
        description: "New passwords do not match",
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        variant: "destructive",
        title: "Weak Password",
        description: "Password must be at least 8 characters long",
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await apiRequest("POST", "/api/auth/change-password", {
        currentPassword,
        newPassword,
      });
      toast({
        title: "Password Changed",
        description: "Your password has been updated successfully",
      });

      // Clear form
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to Change Password",
        description: error.message || "Please check your current password and try again",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="heading-settings">Settings</h1>
        <p className="text-muted-foreground">Manage your account and monitoring preferences</p>
      </div>

      <div className="grid gap-6">
        {(user as any)?.email === "admin@local" && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Security Warning:</strong> You are using the default admin account with factory credentials.
              Please change your password immediately using the form below.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5" />
                <CardTitle>Account Information</CardTitle>
              </div>
              {(user as any)?.role && (
                <Badge variant={(user as any).role === "admin" ? "default" : "secondary"}>
                  {(user as any).role === "admin" ? "Admin" : "Viewer"}
                </Badge>
              )}
            </div>
            <CardDescription>Your account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={(user as any)?.email || ""}
                disabled
                data-testid="input-email"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  data-testid="input-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  data-testid="input-last-name"
                />
              </div>
            </div>
            <Button
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
              size="sm"
              data-testid="button-save-profile"
            >
              {isSavingProfile ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {isSavingProfile ? "Saving..." : "Save Profile"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              <CardTitle>Change Password</CardTitle>
            </div>
            <CardDescription>Update your account password</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  disabled={isChangingPassword}
                  data-testid="input-current-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={isChangingPassword}
                  data-testid="input-new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isChangingPassword}
                  data-testid="input-confirm-password"
                />
              </div>
              <Button
                type="submit"
                disabled={isChangingPassword}
                data-testid="button-change-password"
              >
                {isChangingPassword ? "Changing Password..." : "Change Password"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              <CardTitle>Monitoring Settings</CardTitle>
            </div>
            <CardDescription>Configure camera polling and monitoring behavior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="polling-interval">Polling Interval (minutes)</Label>
              <Select value={pollingInterval} onValueChange={setPollingInterval} disabled={settingsLoading}>
                <SelectTrigger id="polling-interval" data-testid="select-polling-interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 minute</SelectItem>
                  <SelectItem value="5">5 minutes</SelectItem>
                  <SelectItem value="10">10 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                How often to check camera status (default: 5 minutes)
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="email-notifications">Email Notifications</Label>
                <p className="text-xs text-muted-foreground">
                  Receive alerts when cameras go offline
                </p>
              </div>
              <Switch
                id="email-notifications"
                checked={emailNotifications}
                onCheckedChange={setEmailNotifications}
                disabled={settingsLoading}
                data-testid="switch-email-notifications"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              <CardTitle>Certificate Validation</CardTitle>
            </div>
            <CardDescription>Configure TLS certificate validation for camera connections</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="default-cert-mode">Default Mode for New Cameras</Label>
              <Select value={defaultCertMode} onValueChange={setDefaultCertMode} disabled={settingsLoading}>
                <SelectTrigger id="default-cert-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None — Accept any certificate</SelectItem>
                  <SelectItem value="tofu">TOFU — Pin on first connect, alert on change</SelectItem>
                  <SelectItem value="ca">CA Certificate — Validate against trusted CA</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Applied to newly added HTTPS cameras
              </p>
            </div>

            {(defaultCertMode === "ca" || globalCaCert) && (
              <div className="space-y-2">
                <Label htmlFor="global-ca-cert">CA Certificate (PEM)</Label>
                <Textarea
                  id="global-ca-cert"
                  value={globalCaCert}
                  onChange={(e) => setGlobalCaCert(e.target.value)}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                  rows={6}
                  className="font-mono text-xs"
                  disabled={settingsLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Used for cameras set to CA validation mode
                </p>
                {globalCaCert && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setGlobalCaCert("")}
                  >
                    Clear Certificate
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <ApiKeysSection />

        <WebhooksSection />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              <CardTitle>Data Management</CardTitle>
            </div>
            <CardDescription>Configure data retention and storage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="data-retention">Data Retention (days)</Label>
              <Select value={dataRetention} onValueChange={setDataRetention} disabled={settingsLoading}>
                <SelectTrigger id="data-retention" data-testid="select-data-retention">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">180 days</SelectItem>
                  <SelectItem value="365">365 days</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                How long to keep historical uptime data (default: 90 days)
              </p>
            </div>

            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-2">
                Cleanup old data to free up database storage
              </p>
              <Button
                variant="outline"
                onClick={handleRunCleanup}
                disabled={isCleaningUp}
                data-testid="button-cleanup-data"
              >
                {isCleaningUp ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Database className="w-4 h-4 mr-2" />
                )}
                {isCleaningUp ? "Cleaning up..." : "Run Cleanup"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            onClick={handleSaveSettings}
            disabled={isSaving || settingsLoading}
            data-testid="button-save-settings"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Settings"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
