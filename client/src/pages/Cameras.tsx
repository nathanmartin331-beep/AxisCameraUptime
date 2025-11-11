import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Trash2, Eye, Upload } from "lucide-react";
import { Link } from "wouter";
import AddCameraModal, { CameraFormData } from "@/components/AddCameraModal";
import CSVImportModal from "@/components/CSVImportModal";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";

interface Camera {
  id: number;
  name: string;
  ipAddress: string;
  status: string;
  lastSeenAt: string | null;
}

export default function Cameras() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [csvContent, setCsvContent] = useState("");
  const { toast } = useToast();

  const { data: cameras = [], isLoading } = useQuery<Camera[]>({
    queryKey: ["/api/cameras"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (cameraId: number) => {
      return await apiRequest("DELETE", `/api/cameras/${cameraId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cameras"] });
      toast({
        title: "Success",
        description: "Camera deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete camera",
        variant: "destructive",
      });
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: CameraFormData) => {
      return await apiRequest("POST", "/api/cameras", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cameras"] });
      setShowAddDialog(false);
      toast({
        title: "Success",
        description: "Camera added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add camera",
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (csvData: string) => {
      const response = await apiRequest("POST", "/api/cameras/import", {
        csvContent: csvData,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cameras"] });
      setShowImportDialog(false);
      setCsvContent("");
      toast({
        title: "Import Successful",
        description: data.message || `Imported ${data.count} cameras`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import cameras",
        variant: "destructive",
      });
    },
  });

  const handleDeleteCamera = (cameraId: number) => {
    if (!confirm("Are you sure you want to delete this camera?")) return;
    deleteMutation.mutate(cameraId);
  };

  const handleAddCamera = (data: CameraFormData) => {
    addMutation.mutate(data);
  };

  const handleImport = (cameras: any[]) => {
    if (csvContent) {
      importMutation.mutate(csvContent);
    }
  };

  const filteredCameras = cameras.filter((camera) =>
    camera.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    camera.ipAddress.includes(searchQuery)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-cameras">Cameras</h1>
          <p className="text-muted-foreground">Manage your Axis camera fleet</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowImportDialog(true)} variant="outline" data-testid="button-import-csv">
            <Upload className="w-4 h-4 mr-2" />
            Import CSV
          </Button>
          <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-camera">
            <Plus className="w-4 h-4 mr-2" />
            Add Camera
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center gap-4">
            <div>
              <CardTitle>Camera List</CardTitle>
              <CardDescription>
                {cameras.length} camera{cameras.length !== 1 ? "s" : ""} total
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search cameras..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-cameras"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading cameras...</div>
          ) : filteredCameras.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? "No cameras match your search" : "No cameras yet. Add your first camera to get started."}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCameras.map((camera) => (
                <div
                  key={camera.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover-elevate"
                  data-testid={`camera-row-${camera.id}`}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex-1">
                      <h3 className="font-medium" data-testid={`text-camera-name-${camera.id}`}>
                        {camera.name}
                      </h3>
                      <p className="text-sm text-muted-foreground" data-testid={`text-camera-ip-${camera.id}`}>
                        {camera.ipAddress}
                      </p>
                    </div>
                    <Badge
                      variant={camera.status === "online" ? "default" : "secondary"}
                      data-testid={`badge-camera-status-${camera.id}`}
                    >
                      {camera.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/cameras/${camera.id}`}>
                      <Button
                        variant="ghost"
                        size="icon"
                        data-testid={`button-view-camera-${camera.id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteCamera(camera.id)}
                      data-testid={`button-delete-camera-${camera.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddCameraModal 
        open={showAddDialog} 
        onOpenChange={setShowAddDialog}
        onSave={handleAddCamera}
      />
      <CSVImportModal
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImport={handleImport}
        csvContent={csvContent}
        onCsvContentChange={setCsvContent}
      />
    </div>
  );
}
