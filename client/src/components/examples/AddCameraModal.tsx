import { useState } from "react";
import AddCameraModal from "../AddCameraModal";
import { Button } from "@/components/ui/button";

export default function AddCameraModalExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="p-8">
      <Button onClick={() => setOpen(true)}>Open Add Camera Modal</Button>
      <AddCameraModal
        open={open}
        onOpenChange={setOpen}
        onSave={(data) => console.log("Saved camera:", data)}
      />
    </div>
  );
}
