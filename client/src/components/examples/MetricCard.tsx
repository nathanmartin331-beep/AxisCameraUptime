import MetricCard from "../MetricCard";
import { Camera, Wifi, TrendingUp } from "lucide-react";

export default function MetricCardExample() {
  return (
    <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
      <MetricCard
        title="Total Cameras"
        value={324}
        subtitle="Across all locations"
        icon={Camera}
        accentColor="blue"
      />
      <MetricCard
        title="Online Cameras"
        value={312}
        subtitle="96.3% availability"
        icon={Wifi}
        accentColor="green"
      />
      <MetricCard
        title="System Uptime"
        value="99.2%"
        subtitle="Last 30 days"
        icon={TrendingUp}
        accentColor="green"
      />
    </div>
  );
}
