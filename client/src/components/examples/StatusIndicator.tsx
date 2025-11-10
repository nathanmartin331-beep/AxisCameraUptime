import StatusIndicator from "../StatusIndicator";

export default function StatusIndicatorExample() {
  return (
    <div className="p-8 space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Status Indicators</h3>
        <div className="flex items-center gap-6">
          <StatusIndicator status="online" showLabel />
          <StatusIndicator status="offline" showLabel />
          <StatusIndicator status="warning" showLabel />
          <StatusIndicator status="unknown" showLabel />
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Sizes</h3>
        <div className="flex items-center gap-6">
          <StatusIndicator status="online" size="sm" />
          <StatusIndicator status="online" size="md" />
          <StatusIndicator status="online" size="lg" />
        </div>
      </div>
    </div>
  );
}
