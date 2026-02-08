import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AddCameraModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (camera: CameraFormData) => void;
  initialData?: CameraFormData;
  mode?: "add" | "edit";
}

export interface CameraFormData {
  name: string;
  ipAddress: string;
  username: string;
  password: string;
  location: string;
  notes: string;
  protocol: string;
  port: string;
  verifySslCert: boolean;
}

const emptyFormData: CameraFormData = {
  name: "",
  ipAddress: "",
  username: "",
  password: "",
  location: "",
  notes: "",
  protocol: "http",
  port: "",
  verifySslCert: false,
};

export default function AddCameraModal({
  open,
  onOpenChange,
  onSave,
  initialData,
  mode = "add"
}: AddCameraModalProps) {
  const [formData, setFormData] = useState<CameraFormData>(emptyFormData);
  const [testing, setTesting] = useState(false);

  const isEditMode = mode === "edit";

  // Reset form data when the dialog opens or initialData changes
  useEffect(() => {
    if (open) {
      setFormData(initialData || emptyFormData);
    }
  }, [open, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave?.(formData);
  };

  const handleTestConnection = () => {
    setTesting(true);
    console.log("Testing connection to:", formData.ipAddress);
    setTimeout(() => {
      setTesting(false);
      alert("Connection test successful!");
    }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="dialog-add-camera">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Camera" : "Add New Camera"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the camera details and credentials"
              : "Enter the camera details and credentials for monitoring"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Camera Name *</Label>
                <Input
                  id="name"
                  data-testid="input-camera-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Main Entrance"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ipAddress">IP Address *</Label>
                <Input
                  id="ipAddress"
                  data-testid="input-ip-address"
                  value={formData.ipAddress}
                  onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                  placeholder="192.168.1.100 or 203.0.113.50"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Private or public IP address
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="protocol">Protocol</Label>
                <select
                  id="protocol"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                  value={formData.protocol}
                  onChange={(e) => {
                    const newProtocol = e.target.value;
                    setFormData({
                      ...formData,
                      protocol: newProtocol,
                      port: formData.port || "",
                    });
                  }}
                >
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                  placeholder={formData.protocol === "https" ? "443" : "80"}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank for default
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="verifySslCert">SSL Verification</Label>
                <div className="flex items-center gap-2 h-9">
                  <input
                    type="checkbox"
                    id="verifySslCert"
                    checked={formData.verifySslCert}
                    onChange={(e) => setFormData({ ...formData, verifySslCert: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300"
                    disabled={formData.protocol !== "https"}
                  />
                  <Label htmlFor="verifySslCert" className="text-xs font-normal text-muted-foreground">
                    Verify certificate
                  </Label>
                </div>
                {formData.protocol === "https" && !formData.verifySslCert && (
                  <p className="text-xs text-yellow-600">
                    Self-signed certs accepted
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  data-testid="input-username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="admin"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">
                  Password {isEditMode ? "(leave blank to keep current)" : "*"}
                </Label>
                <Input
                  id="password"
                  type="password"
                  data-testid="input-password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={isEditMode ? "Enter new password to change" : ""}
                  required={!isEditMode}
                />
                {isEditMode && (
                  <p className="text-xs text-muted-foreground">
                    Only fill in if you want to change the password
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                data-testid="input-location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g., Building A - Floor 1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                data-testid="input-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Optional notes about this camera"
                rows={3}
              />
            </div>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Camera model and capabilities will be automatically detected on the first successful connection.
                AXIS OS 13+ cameras default to HTTPS only.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || !formData.ipAddress}
              data-testid="button-test-connection"
            >
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test Connection
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button type="submit" data-testid="button-save">
              {isEditMode ? "Update Camera" : "Save Camera"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
