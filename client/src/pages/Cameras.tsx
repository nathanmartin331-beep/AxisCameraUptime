import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Trash2, Eye, Upload, MapPin, Pencil, Lock, Unlock, Loader2 } from "lucide-react";
import { Link } from "wouter";
import AddCameraModal, { CameraFormData } from "@/components/AddCameraModal";
import CSVImportModal from "@/components/CSVImportModal";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Camera {
  id: number;
  name: string;
  ipAddress: string;
  username: string;
  status: string;
  location?: string;
  notes?: string | null;
  lastSeenAt: string | null;
  protocol?: string;
}

export default function Cameras() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editCameraId, setEditCameraId] = useState<number | null>(null);
  const [editCameraData, setEditCameraData] = useState<CameraFormData | undefined>(undefined);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [csvContent, setCsvContent] = useState("");
  const { toast } = useToast();

  // Keyboard shortcuts: / to focus search, n to open add camera
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[data-testid="input-search-cameras"]')?.focus();
      } else if (e.key === "n" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowAddDialog(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const { data: cameras = [], isLoading } = useQuery<Camera[]>({
    queryKey: ["/api/cameras"],
    refetchInterval: 10000, // Refresh every 10s to reflect monitor updates
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
      const payload: Record<string, any> = {
        name: data.name,
        ipAddress: data.ipAddress,
        username: data.username,
        password: data.password,
        location: data.location,
        notes: data.notes,
        protocol: data.protocol,
        port: data.port ? parseInt(data.port, 10) : undefined,
        verifySslCert: data.verifySslCert,
      };
      return await apiRequest("POST", "/api/cameras", payload);
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
    setDeleteConfirmId(cameraId);
  };

  const handleAddCamera = (data: CameraFormData) => {
    addMutation.mutate(data);
  };

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CameraFormData }) => {
      const payload: Record<string, any> = {
        name: data.name,
        ipAddress: data.ipAddress,
        username: data.username,
        location: data.location,
        notes: data.notes,
        protocol: data.protocol,
        port: data.port ? parseInt(data.port, 10) : undefined,
        verifySslCert: data.verifySslCert,
      };
      if (data.password) {
        payload.password = data.password;
      }
      return await apiRequest("PATCH", `/api/cameras/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cameras"] });
      setShowEditDialog(false);
      setEditCameraId(null);
      setEditCameraData(undefined);
      toast({
        title: "Success",
        description: "Camera updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update camera",
        variant: "destructive",
      });
    },
  });

  const handleEditCamera = (camera: Camera) => {
    setEditCameraId(camera.id);
    setEditCameraData({
      name: camera.name,
      ipAddress: camera.ipAddress,
      username: camera.username || "",
      password: "",
      location: camera.location || "",
      notes: camera.notes || "",
      protocol: (camera as any).protocol || "http",
      port: (camera as any).port ? String((camera as any).port) : "",
      verifySslCert: (camera as any).verifySslCert ?? false,
    });
    setShowEditDialog(true);
  };

  const handleEditSave = (data: CameraFormData) => {
    if (editCameraId !== null) {
      editMutation.mutate({ id: editCameraId, data });
    }
  };

  const handleImport = (cameras: any[]) => {
    if (csvContent) {
      importMutation.mutate(csvContent);
    }
  };

  // Get unique locations for filter dropdown
  const uniqueLocations = useMemo(() => {
    const locations = cameras
      .map(camera => camera.location)
      .filter((loc): loc is string => !!loc && loc.trim() !== "");
    return Array.from(new Set(locations)).sort();
  }, [cameras]);

  const filteredCameras = cameras.filter((camera) => {
    // Search filter
    const matchesSearch = 
      camera.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      camera.ipAddress.includes(searchQuery) ||
      (camera.location?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    
    // Location filter
    const matchesLocation = 
      locationFilter === "all" || 
      (locationFilter === "none" && (!camera.location || camera.location.trim() === "")) ||
      camera.location === locationFilter;

    return matchesSearch && matchesLocation;
  });

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
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Camera List</CardTitle>
                <CardDescription>
                  {filteredCameras.length} of {cameras.length} camera{cameras.length !== 1 ? "s" : ""}
                  {locationFilter !== "all" && " (filtered by location)"}
                </CardDescription>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, IP, or location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-cameras"
                />
              </div>
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-64" data-testid="select-location-filter">
                  <MapPin className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="location-option-all">All Locations</SelectItem>
                  <SelectItem value="none" data-testid="location-option-none">No Location</SelectItem>
                  {uniqueLocations.map((location) => (
                    <SelectItem 
                      key={location} 
                      value={location}
                      data-testid={`location-option-${location.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <Skeleton className="h-8 w-8 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredCameras.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              {searchQuery || locationFilter !== "all" ? (
                <p className="text-muted-foreground">No cameras match your filters</p>
              ) : (
                <>
                  <Eye className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-1">No cameras yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Add your first camera to start monitoring uptime.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowImportDialog(true)}>
                      <Upload className="w-4 h-4 mr-2" />
                      Import CSV
                    </Button>
                    <Button onClick={() => setShowAddDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Camera
                    </Button>
                  </div>
                </>
              )}
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
                      <div className="flex items-center gap-1.5" data-testid={`text-camera-ip-${camera.id}`}>
                        <p className="text-sm text-muted-foreground">
                          {camera.ipAddress}
                        </p>
                        {camera.protocol === "https" ? (
                          <Badge variant="outline" className="gap-0.5 px-1.5 py-0 text-[10px] border-green-500 text-green-700 bg-green-50">
                            <Lock className="w-2.5 h-2.5" />
                            HTTPS
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-0.5 px-1.5 py-0 text-[10px] border-amber-400 text-amber-600 bg-amber-50">
                            <Unlock className="w-2.5 h-2.5" />
                            HTTP
                          </Badge>
                        )}
                      </div>
                      {camera.location && (
                        <div className="flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground" data-testid={`text-camera-location-${camera.id}`}>
                            {camera.location}
                          </p>
                        </div>
                      )}
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
                      onClick={() => handleEditCamera(camera)}
                      data-testid={`button-edit-camera-${camera.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
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
        mode="add"
        isPending={addMutation.isPending}
      />
      <AddCameraModal
        open={showEditDialog}
        onOpenChange={(open) => {
          setShowEditDialog(open);
          if (!open) {
            setEditCameraId(null);
            setEditCameraData(undefined);
          }
        }}
        onSave={handleEditSave}
        initialData={editCameraData}
        mode="edit"
        isPending={editMutation.isPending}
      />
      <CSVImportModal
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImport={handleImport}
        csvContent={csvContent}
        onCsvContentChange={setCsvContent}
      />

      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Camera</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this camera and all its monitoring history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteConfirmId !== null) {
                  deleteMutation.mutate(deleteConfirmId, {
                    onSuccess: () => setDeleteConfirmId(null),
                  });
                }
              }}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
