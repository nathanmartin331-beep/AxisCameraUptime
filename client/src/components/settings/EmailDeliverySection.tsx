import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, Loader2, Save, Send } from "lucide-react";

interface EmailConfig {
  fromEmail: string | null;
  fromName: string | null;
  emailEnabled: boolean;
  apiKeyPrefix: string | null;
  isConfigured: boolean;
}

export default function EmailDeliverySection() {
  const { toast } = useToast();

  const { data: config, isLoading } = useQuery<EmailConfig>({
    queryKey: ["/api/settings/email"],
  });

  const [apiKey, setApiKey] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (config) {
      setFromEmail(config.fromEmail ?? "");
      setFromName(config.fromName ?? "");
      setEnabled(config.emailEnabled);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        fromEmail: fromEmail || undefined,
        fromName: fromName || undefined,
        emailEnabled: enabled,
      };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      const res = await apiRequest("PATCH", "/api/settings/email", body);
      return (await res.json()) as EmailConfig;
    },
    onSuccess: () => {
      setApiKey("");
      queryClient.invalidateQueries({ queryKey: ["/api/settings/email"] });
      toast({ title: "Email settings saved" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Save failed", description: error.message });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/settings/email/test");
      return (await res.json()) as { message: string };
    },
    onSuccess: (data) => {
      toast({ title: "Test email sent", description: data.message });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Test email failed", description: error.message });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5" />
          <CardTitle>Email Delivery (SendGrid)</CardTitle>
        </div>
        <CardDescription>
          Configure SendGrid for sending scheduled and on-demand reports
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="sg-api-key">SendGrid API Key</Label>
              <Input
                id="sg-api-key"
                type="password"
                value={apiKey}
                placeholder={config?.isConfigured ? `Configured (${config.apiKeyPrefix}…)` : "SG.xxxxxxxx..."}
                onChange={(e) => setApiKey(e.target.value)}
                data-testid="input-sendgrid-key"
              />
              <p className="text-xs text-muted-foreground">
                {config?.isConfigured
                  ? "Leave blank to keep the existing key. Enter a new value to replace it."
                  : "Create a Web API key in SendGrid with Mail Send permission."}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="from-email">From Email</Label>
                <Input
                  id="from-email"
                  type="email"
                  value={fromEmail}
                  placeholder="reports@yourdomain.com"
                  onChange={(e) => setFromEmail(e.target.value)}
                  data-testid="input-from-email"
                />
                <p className="text-xs text-muted-foreground">
                  Must be a verified sender or domain in SendGrid.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="from-name">From Name</Label>
                <Input
                  id="from-name"
                  value={fromName}
                  placeholder="Axis Camera Uptime"
                  onChange={(e) => setFromName(e.target.value)}
                  data-testid="input-from-name"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">Email delivery enabled</div>
                <div className="text-xs text-muted-foreground">
                  When off, no emails are sent regardless of schedules.
                </div>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                data-testid="switch-email-enabled"
              />
            </div>

            {config?.isConfigured && (
              <Alert>
                <AlertDescription className="flex items-center gap-2">
                  Status: <Badge variant={config.emailEnabled ? "default" : "secondary"}>
                    {config.emailEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                  Key prefix: <code className="text-xs">{config.apiKeyPrefix}…</code>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                data-testid="button-save-email-settings"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save
              </Button>
              <Button
                variant="outline"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending || !config?.isConfigured || !config?.emailEnabled}
                data-testid="button-send-test-email"
              >
                {testMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Send test email
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
