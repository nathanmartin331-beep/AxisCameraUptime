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
import { Loader2, Info, Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";

interface AddCameraModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (camera: CameraFormData) => void;
  initialData?: CameraFormData;
  mode?: "add" | "edit";
  isPending?: boolean;
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
  mode = "add",
  isPending = false,
}: AddCameraModalProps) {
  const [formData, setFormData] = useState<CameraFormData>(emptyFormData);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEditMode = mode === "edit";

  // Reset form data when the dialog opens or initialData changes
  useEffect(() => {
    if (open) {
      setFormData(initialData || emptyFormData);
      setShowPassword(false);
      setErrors({});
      setTestResult(null);
    }
  }, [open, initialData]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "Camera name is required";
    if (!formData.ipAddress.trim()) {
      newErrors.ipAddress = "IP address is required";
    } else if (!/^[\d.]+$|^[\da-fA-F:]+$|^[a-zA-Z0-9.-]+$/.test(formData.ipAddress.trim())) {
      newErrors.ipAddress = "Invalid IP address or hostname";
    }
    if (!formData.username.trim()) newErrors.username = "Username is required";
    if (!isEditMode && !formData.password) newErrors.password = "Password is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSave?.(formData);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiRequest("POST", "/api/cameras/test-connection", {
        ipAddress: formData.ipAddress.trim(),
        username: formData.username.trim(),
        password: formData.password,
        protocol: formData.protocol || "http",
        ...(formData.port ? { port: parseInt(formData.port, 10) } : {}),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: `Connected in ${data.responseTime}ms${data.isAxisCamera ? " (Axis camera detected)" : ""}` });
      } else {
        setTestResult({ success: false, message: data.error || "Connection failed" });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || "Connection test failed" });
    } finally {
      setTesting(false);
    }
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
                  onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setErrors(prev => ({ ...prev, name: "" })); }}
                  placeholder="e.g., Main Entrance"
                  className={errors.name ? "border-red-500" : ""}
                />
                {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ipAddress">IP Address *</Label>
                <Input
                  id="ipAddress"
                  data-testid="input-ip-address"
                  value={formData.ipAddress}
                  onChange={(e) => { setFormData({ ...formData, ipAddress: e.target.value }); setErrors(prev => ({ ...prev, ipAddress: "" })); }}
                  placeholder="192.168.1.100 or 203.0.113.50"
                  className={errors.ipAddress ? "border-red-500" : ""}
                />
                {errors.ipAddress ? (
                  <p className="text-xs text-red-500">{errors.ipAddress}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Private or public IP address</p>
                )}
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
                  onChange={(e) => { setFormData({ ...formData, username: e.target.value }); setErrors(prev => ({ ...prev, username: "" })); }}
                  placeholder="admin"
                  className={errors.username ? "border-red-500" : ""}
                />
                {errors.username && <p className="text-xs text-red-500">{errors.username}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">
                  Password {isEditMode ? "(leave blank to keep current)" : "*"}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    data-testid="input-password"
                    value={formData.password}
                    onChange={(e) => { setFormData({ ...formData, password: e.target.value }); setErrors(prev => ({ ...prev, password: "" })); }}
                    placeholder={isEditMode ? "Enter new password to change" : ""}
                    className={errors.password ? "border-red-500 pr-10" : "pr-10"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                </div>
                {errors.password ? (
                  <p className="text-xs text-red-500">{errors.password}</p>
                ) : isEditMode ? (
                  <p className="text-xs text-muted-foreground">
                    Only fill in if you want to change the password
                  </p>
                ) : null}
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
            {testResult && (
              <p className={`text-xs ${testResult.success ? "text-green-600" : "text-red-600"}`}>
                {testResult.message}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || !formData.ipAddress || !formData.username || !formData.password}
              data-testid="button-test-connection"
            >
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {testResult ? (testResult.success ? <CheckCircle className="mr-2 h-4 w-4 text-green-600" /> : <XCircle className="mr-2 h-4 w-4 text-red-600" />) : null}
              {testResult ? (testResult.success ? "Connected" : "Failed") : "Test Connection"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button type="submit" data-testid="button-save" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? "Saving..." : isEditMode ? "Update Camera" : "Save Camera"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
