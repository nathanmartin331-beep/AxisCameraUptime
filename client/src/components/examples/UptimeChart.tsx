import UptimeChart from "../UptimeChart";

export default function UptimeChartExample() {
  return (
    <div className="p-8">
      <UptimeChart
        cameraId="demo-camera-1"
        days={30}
        title="Demo Uptime Chart"
        description="Example uptime visualization"
      />
    </div>
  );
}
