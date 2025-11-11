import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, Download, FileText, AlertCircle } from "lucide-react";
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
  csvContent?: string;
  onCsvContentChange?: (content: string) => void;
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
  onImport,
  csvContent,
  onCsvContentChange
}: CSVImportModalProps) {
  const [preview, setPreview] = useState<CSVRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset previous state
    setFileName(file.name);
    setParseErrors([]);
    setPreview([]);
    if (onCsvContentChange) {
      onCsvContentChange("");
    }
    console.log("File selected:", file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      let fileContent = event.target?.result as string;
      if (!fileContent) return;

      // Remove BOM if present (UTF-8 with BOM)
      if (fileContent.charCodeAt(0) === 0xFEFF) {
        fileContent = fileContent.slice(1);
      }

      // Notify parent of CSV content
      if (onCsvContentChange) {
        onCsvContentChange(fileContent);
      }

      try {
        // Handle both \r\n (Windows) and \n (Unix) line endings
        const lines = fileContent
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        if (lines.length === 0) {
          console.error("CSV file is empty");
          return;
        }

        // Use parseCSVLine for header too to handle quoted fields
        const headerValues = parseCSVLine(lines[0]);
        const header = headerValues.map((h) => h.trim().toLowerCase());
        
        // Validate required headers are present
        const requiredHeaders = ['name', 'ipaddress', 'username', 'password'];
        const missingHeaders = requiredHeaders.filter(h => !header.includes(h));
        
        if (missingHeaders.length > 0) {
          const errorMsg = `Missing required columns: ${missingHeaders.join(', ')}. Required: name, ipAddress, username, password`;
          console.error(errorMsg);
          setParseErrors([errorMsg]);
          // Clear all state to prevent invalid import
          setPreview([]);
          setFileName("");
          if (onCsvContentChange) {
            onCsvContentChange("");
          }
          // Reset file input by changing key
          setFileInputKey(prev => prev + 1);
          return;
        }
        
        const cameras: CSVRow[] = [];

        // Helper to safely get column value
        const getColumn = (columnName: string, values: string[], isOptional: boolean = false): string => {
          const index = header.indexOf(columnName);
          if (index < 0) {
            if (!isOptional) {
              throw new Error(`Required column "${columnName}" not found`);
            }
            return "";
          }
          const value = values[index]?.trim() || "";
          return value;
        };

        const rowErrors: string[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const rowNum = i + 1;

          try {
            const camera: CSVRow = {
              name: getColumn("name", values),
              ipAddress: getColumn("ipaddress", values),
              username: getColumn("username", values),
              password: getColumn("password", values) || "********",
              location: getColumn("location", values, true),
            };

            // Validate required fields are not empty
            if (!camera.name || !camera.ipAddress || !camera.username || !camera.password || camera.password === "********") {
              rowErrors.push(`Row ${rowNum}: Missing required field (name, ipAddress, username, or password)`);
              continue;
            }

            cameras.push(camera);
          } catch (rowError: any) {
            rowErrors.push(`Row ${rowNum}: ${rowError.message}`);
          }
        }

        setPreview(cameras);
        setParseErrors(rowErrors);
        console.log(`Parsed ${cameras.length} cameras from CSV${rowErrors.length > 0 ? ` (${rowErrors.length} errors)` : ''}`);
        
        // If there are ANY errors, reset file input so user can retry with corrected file
        if (rowErrors.length > 0) {
          setFileName("");
          if (onCsvContentChange) {
            onCsvContentChange("");
          }
          setFileInputKey(prev => prev + 1);
        }
      } catch (error) {
        console.error("Error parsing CSV:", error);
        setParseErrors([`Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`]);
        // Reset on parse error
        setFileName("");
        setPreview([]);
        if (onCsvContentChange) {
          onCsvContentChange("");
        }
        setFileInputKey(prev => prev + 1);
      }
    };

    reader.readAsText(file);
  };

  const parseCSVLine = (line: string): string[] => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
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
          {parseErrors.length > 0 && (
            <Alert variant="destructive" data-testid="alert-parse-errors">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>CSV Validation Errors</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  {parseErrors.slice(0, 5).map((error, idx) => (
                    <li key={idx} className="text-sm">{error}</li>
                  ))}
                  {parseErrors.length > 5 && (
                    <li className="text-sm font-medium">...and {parseErrors.length - 5} more errors</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

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
              key={fileInputKey}
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
