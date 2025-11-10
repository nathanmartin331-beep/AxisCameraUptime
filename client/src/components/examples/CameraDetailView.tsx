import CameraDetailView from "../CameraDetailView";

const mockCamera = {
  id: "1",
  name: "Main Entrance",
  ipAddress: "192.168.1.101",
  location: "Building A - Floor 1",
  status: "online" as const,
  currentUptime: "7d 14h 32m",
  totalUptime: "99.8%",
  lastSeen: "2 minutes ago",
  addedDate: "Jan 15, 2024",
  bootId: "ebe1fa05-2ff7-4062-874c-68a466a9eaed",
  reboots: [
    {
      timestamp: "Nov 3, 2024 14:23",
      duration: "5 minutes",
      bootId: "a3b4c5d6-7e8f-9012-3456-789abcdef012"
    },
    {
      timestamp: "Oct 28, 2024 09:15",
      duration: "3 minutes",
      bootId: "b4c5d6e7-8f90-1234-5678-9abcdef01234"
    }
  ]
};

export default function CameraDetailViewExample() {
  return (
    <div className="p-8">
      <CameraDetailView
        camera={mockCamera}
        onBack={() => console.log("Back clicked")}
        onEdit={() => console.log("Edit clicked")}
        onDelete={() => console.log("Delete clicked")}
      />
    </div>
  );
}
