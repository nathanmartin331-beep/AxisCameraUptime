import { useState } from "react";
import CSVImportModal from "../CSVImportModal";
import { Button } from "@/components/ui/button";

export default function CSVImportModalExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="p-8">
      <Button onClick={() => setOpen(true)}>Open CSV Import</Button>
      <CSVImportModal
        open={open}
        onOpenChange={setOpen}
        onImport={(cameras) => console.log("Imported cameras:", cameras)}
      />
    </div>
  );
}
