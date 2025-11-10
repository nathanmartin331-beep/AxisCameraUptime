import CameraTable, { Camera } from "../CameraTable";

const mockCameras: Camera[] = [
  {
    id: "1",
    name: "Main Entrance",
    ipAddress: "192.168.1.101",
    location: "Building A - Floor 1",
    status: "online",
    uptime: "99.8%",
    lastSeen: "2 minutes ago"
  },
  {
    id: "2",
    name: "Parking Lot North",
    ipAddress: "192.168.1.102",
    location: "Building A - Exterior",
    status: "online",
    uptime: "98.5%",
    lastSeen: "1 minute ago"
  },
  {
    id: "3",
    name: "Server Room",
    ipAddress: "192.168.1.103",
    location: "Building B - Floor 2",
    status: "offline",
    uptime: "85.2%",
    lastSeen: "3 hours ago"
  },
  {
    id: "4",
    name: "Loading Dock",
    ipAddress: "192.168.1.104",
    location: "Warehouse",
    status: "warning",
    uptime: "95.1%",
    lastSeen: "15 minutes ago"
  }
];

export default function CameraTableExample() {
  return (
    <div className="p-8">
      <CameraTable
        cameras={mockCameras}
        onViewDetails={(camera) => console.log("View details:", camera)}
        onEdit={(camera) => console.log("Edit:", camera)}
        onDelete={(camera) => console.log("Delete:", camera)}
      />
    </div>
  );
}
