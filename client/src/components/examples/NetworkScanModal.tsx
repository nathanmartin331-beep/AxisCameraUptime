import { useState } from "react";
import NetworkScanModal from "../NetworkScanModal";
import { Button } from "@/components/ui/button";

export default function NetworkScanModalExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="p-8">
      <Button onClick={() => setOpen(true)}>Open Network Scanner</Button>
      <NetworkScanModal
        open={open}
        onOpenChange={setOpen}
        onAddCameras={(ips) => console.log("Adding cameras:", ips)}
      />
    </div>
  );
}
