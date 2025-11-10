import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Download, FileText } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CSVImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport?: (cameras: any[]) => void;
}

interface CSVRow {
  name: string;
  ipAddress: string;
  location: string;
  username: string;
  password: string;
}

export default function CSVImportModal({
  open,
  onOpenChange,
  onImport
}: CSVImportModalProps) {
  const [preview, setPreview] = useState<CSVRow[]>([]);
  const [fileName, setFileName] = useState("");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    console.log("File selected:", file.name);

    setPreview([
      {
        name: "Main Entrance",
        ipAddress: "192.168.1.101",
        location: "Building A - Floor 1",
        username: "admin",
        password: "********"
      },
      {
        name: "Parking Lot",
        ipAddress: "192.168.1.102",
        location: "Building A - Exterior",
        username: "admin",
        password: "********"
      },
      {
        name: "Server Room",
        ipAddress: "192.168.1.103",
        location: "Building B - Floor 2",
        username: "admin",
        password: "********"
      }
    ]);
  };

  const handleImport = () => {
    onImport?.(preview);
    console.log("Importing cameras:", preview);
    onOpenChange(false);
  };

  const downloadTemplate = () => {
    console.log("Downloading CSV template");
    const csvContent = "name,ipAddress,location,username,password\n" +
      "Camera Name,192.168.1.100,Building A,admin,password123\n";
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'camera_import_template.csv';
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]" data-testid="dialog-csv-import">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Import Cameras from CSV
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to bulk import camera configurations
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-md bg-muted/50">
            <div className="space-y-1">
              <p className="text-sm font-medium">CSV Template</p>
              <p className="text-xs text-muted-foreground">
                Download the template to see the required format
              </p>
            </div>
            <Button
              variant="outline"
              onClick={downloadTemplate}
              data-testid="button-download-template"
            >
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
          </div>

          <div className="border-2 border-dashed rounded-md p-8 text-center">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
              id="csv-upload"
              data-testid="input-csv-file"
            />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm font-medium mb-1">
                {fileName || "Click to upload or drag and drop"}
              </p>
              <p className="text-xs text-muted-foreground">
                CSV files only
              </p>
            </label>
          </div>

          {preview.length > 0 && (
            <>
              <div>
                <h3 className="text-sm font-semibold mb-2">
                  Preview ({preview.length} cameras)
                </h3>
                <div className="border rounded-md max-h-[300px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>IP Address</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Password</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.map((row, idx) => (
                        <TableRow key={idx} data-testid={`preview-row-${idx}`}>
                          <TableCell>{row.name}</TableCell>
                          <TableCell>
                            <code className="text-sm font-mono">{row.ipAddress}</code>
                          </TableCell>
                          <TableCell>{row.location}</TableCell>
                          <TableCell>{row.username}</TableCell>
                          <TableCell>
                            <code className="text-xs text-muted-foreground">{row.password}</code>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button onClick={handleImport} data-testid="button-import">
                  Import {preview.length} Camera(s)
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
