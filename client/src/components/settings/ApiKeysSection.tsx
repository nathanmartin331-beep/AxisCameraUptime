import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Key, Plus, Trash2, Copy, Loader2 } from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[] | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

interface CreatedApiKey {
  id: string;
  name: string;
  key: string;
  prefix: string;
  scopes: string[] | null;
  createdAt: string;
  expiresAt: string | null;
}

export default function ApiKeysSection() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);

  const { data: apiKeys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/settings/api-keys"],
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/settings/api-keys", { name });
      return (await res.json()) as CreatedApiKey;
    },
    onSuccess: (data) => {
      setCreatedKey(data);
      setKeyName("");
      queryClient.invalidateQueries({ queryKey: ["/api/settings/api-keys"] });
      toast({ title: "API Key Created", description: `Key "${data.name}" has been created` });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to Create Key", description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/settings/api-keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/api-keys"] });
      toast({ title: "API Key Revoked", description: "The key has been permanently revoked" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to Revoke Key", description: error.message });
    },
  });

  const handleCreate = () => {
    if (!keyName.trim()) return;
    createMutation.mutate(keyName.trim());
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "API key copied to clipboard" });
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setCreatedKey(null);
      setKeyName("");
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            <CardTitle>API Keys</CardTitle>
          </div>
          <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Create API Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create API Key</DialogTitle>
              </DialogHeader>
              {createdKey ? (
                <div className="space-y-4">
                  <Alert>
                    <Key className="h-4 w-4" />
                    <AlertDescription>
                      Copy this key now. You won't be able to see it again.
                    </AlertDescription>
                  </Alert>
                  <div className="flex items-center gap-2">
                    <Input value={createdKey.key} readOnly className="font-mono text-xs" />
                    <Button size="icon" variant="outline" onClick={() => handleCopy(createdKey.key)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button className="w-full" onClick={() => handleDialogChange(false)}>Done</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="key-name">Key Name</Label>
                    <Input
                      id="key-name"
                      placeholder="e.g. CI/CD Pipeline"
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleCreate}
                    disabled={!keyName.trim() || createMutation.isPending}
                  >
                    {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {createMutation.isPending ? "Creating..." : "Create"}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
        <CardDescription>Manage API keys for programmatic access</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : apiKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No API keys yet. Create one to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {apiKeys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{k.name}</span>
                    <Badge variant="outline" className="font-mono text-xs">
                      {k.keyPrefix}...
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created {formatDate(k.createdAt)}
                    {" \u00b7 "}
                    Last used {formatDate(k.lastUsedAt)}
                    {k.expiresAt && ` \u00b7 Expires ${formatDate(k.expiresAt)}`}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteMutation.mutate(k.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
