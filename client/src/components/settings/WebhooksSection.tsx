import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Webhook, Plus, Trash2, Copy, Loader2, Send, AlertTriangle } from "lucide-react";

interface WebhookEntry {
  id: number;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  lastDeliveryAt: string | null;
  consecutiveFailures: number;
}

interface CreatedWebhook {
  id: number;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

const EVENT_TYPES = [
  { value: "analytics.occupancy", label: "Occupancy" },
  { value: "analytics.people_in", label: "People In" },
  { value: "analytics.people_out", label: "People Out" },
  { value: "analytics.line_crossing", label: "Line Crossing" },
  { value: "status.online", label: "Camera Online" },
  { value: "status.offline", label: "Camera Offline" },
] as const;

export default function WebhooksSection() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const { data: webhooks, isLoading } = useQuery<WebhookEntry[]>({
    queryKey: ["/api/settings/webhooks"],
  });

  const createMutation = useMutation({
    mutationFn: async (body: { url: string; events: string[] }) => {
      const res = await apiRequest("POST", "/api/settings/webhooks", body);
      return (await res.json()) as CreatedWebhook;
    },
    onSuccess: (data) => {
      setRevealedSecret(data.secret);
      setNewUrl("");
      setSelectedEvents([]);
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/settings/webhooks"] });
      toast({ title: "Webhook Created", description: `Webhook for ${data.url} has been added` });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to Create Webhook", description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/settings/webhooks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/webhooks"] });
      toast({ title: "Webhook Deleted", description: "The webhook has been removed" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to Delete Webhook", description: error.message });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/settings/webhooks/${id}/test`);
      return (await res.json()) as { message: string; status: number };
    },
    onSuccess: (data) => {
      toast({ title: "Test Sent", description: data.message });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Test Failed", description: error.message });
    },
  });

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const handleCreate = () => {
    if (!newUrl.trim()) return;
    if (selectedEvents.length === 0) return;
    createMutation.mutate({ url: newUrl.trim(), events: selectedEvents });
  };

  const copySecret = async (secret: string) => {
    await navigator.clipboard.writeText(secret);
    toast({ title: "Copied", description: "Secret copied to clipboard" });
  };

  const isInactive = (wh: WebhookEntry) => !wh.active || wh.consecutiveFailures >= 10;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Webhook className="w-5 h-5" />
              <CardTitle>Webhooks</CardTitle>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => setRevealedSecret(null)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Webhook
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Webhook</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="webhook-url">URL</Label>
                    <Input
                      id="webhook-url"
                      placeholder="https://example.com/webhook"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Events</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {EVENT_TYPES.map((evt) => (
                        <div key={evt.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={`event-${evt.value}`}
                            checked={selectedEvents.includes(evt.value)}
                            onCheckedChange={() => toggleEvent(evt.value)}
                          />
                          <Label htmlFor={`event-${evt.value}`} className="text-sm font-normal cursor-pointer">
                            {evt.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button
                    onClick={handleCreate}
                    disabled={!newUrl.trim() || selectedEvents.length === 0 || createMutation.isPending}
                    className="w-full"
                  >
                    {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Create
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <CardDescription>Receive HTTP callbacks when events occur</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {revealedSecret && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between gap-2">
                <span className="text-sm">
                  Save this secret for verifying webhook signatures. It won't be shown again:{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs break-all">{revealedSecret}</code>
                </span>
                <Button variant="outline" size="sm" onClick={() => copySecret(revealedSecret)}>
                  <Copy className="w-3 h-3 mr-1" />
                  Copy
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {isLoading && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && (!webhooks || webhooks.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No webhooks configured. Add one to receive event notifications.
            </p>
          )}

          {webhooks?.map((wh) => (
            <div key={wh.id} className="flex items-center justify-between border rounded-lg p-3 gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate max-w-[280px]" title={wh.url}>
                    {wh.url}
                  </span>
                  {isInactive(wh) ? (
                    <Badge variant="destructive">Inactive</Badge>
                  ) : (
                    <Badge variant="default" className="bg-green-600">Active</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {wh.events.map((evt) => (
                    <Badge key={evt} variant="secondary" className="text-xs">
                      {evt}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  {wh.lastDeliveryAt && (
                    <span>Last delivery: {new Date(wh.lastDeliveryAt).toLocaleString()}</span>
                  )}
                  {wh.consecutiveFailures > 0 && (
                    <span className="text-red-500">
                      {wh.consecutiveFailures} consecutive failure{wh.consecutiveFailures !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testMutation.mutate(wh.id)}
                  disabled={testMutation.isPending}
                >
                  {testMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Send className="w-3 h-3" />
                  )}
                  <span className="ml-1">Test</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteMutation.mutate(wh.id)}
                  disabled={deleteMutation.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                  <span className="ml-1">Delete</span>
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
