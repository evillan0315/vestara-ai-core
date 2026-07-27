import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface PieSlice {
  name: string;
  value: number;
  color: string;
}
interface PieChartCardProps {
  data: PieSlice[];
  size?: number;
  innerRadius?: number;
  outerRadius?: number;
}

export default function PieChartCard({ data, size = 56, innerRadius = 16, outerRadius = 26 }: PieChartCardProps) {
  if (data.length === 0) return null;
  return (
    <div className={`w-${size / 4} h-${size / 4} shrink-0`} style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
          >
            {data.map((d, i) => (
              <Cell key={d.name || i} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
