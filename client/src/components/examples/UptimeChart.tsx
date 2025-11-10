import UptimeChart from "../UptimeChart";

const generateMockData = () => {
  const data = [];
  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      uptime: 95 + Math.random() * 5
    });
  }
  return data;
};

export default function UptimeChartExample() {
  return (
    <div className="p-8">
      <UptimeChart data={generateMockData()} />
    </div>
  );
}
