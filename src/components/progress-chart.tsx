'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ProgressPoint {
  date: string;
  e1rm: number;
}

interface ChartData {
  date: string;
  BP?: number;
  SQ?: number;
  DL?: number;
}

export function ProgressChart() {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [bpRes, sqRes, dlRes] = await Promise.all([
          fetch('/api/training/531/progress?liftId=BP'),
          fetch('/api/training/531/progress?liftId=SQ'),
          fetch('/api/training/531/progress?liftId=DL'),
        ]);

        const bpData = await bpRes.json();
        const sqData = await sqRes.json();
        const dlData = await dlRes.json();

        // Merge data by date
        const dateMap = new Map<string, ChartData>();

        if (bpData.points) {
          bpData.points.forEach((point: ProgressPoint) => {
            const entry = dateMap.get(point.date) || { date: point.date };
            entry.BP = point.e1rm;
            dateMap.set(point.date, entry);
          });
        }

        if (sqData.points) {
          sqData.points.forEach((point: ProgressPoint) => {
            const entry = dateMap.get(point.date) || { date: point.date };
            entry.SQ = point.e1rm;
            dateMap.set(point.date, entry);
          });
        }

        if (dlData.points) {
          dlData.points.forEach((point: ProgressPoint) => {
            const entry = dateMap.get(point.date) || { date: point.date };
            entry.DL = point.e1rm;
            dateMap.set(point.date, entry);
          });
        }

        const sortedData = Array.from(dateMap.values()).sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        setData(sortedData);
      } catch (error) {
        console.error('Failed to fetch progress data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="panel flex h-64 items-center justify-center p-4">
        <p className="text-gray-400">Loading progress...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="panel flex h-64 items-center justify-center p-4">
        <p className="text-gray-400">No progress data yet</p>
      </div>
    );
  }

  return (
    <div className="panel p-4">
      <h3 className="mb-4 text-xl font-bold text-white">Progress</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2f3a47" />
          <XAxis
            dataKey="date"
            stroke="#9fb0c2"
            tick={{ fontSize: 12 }}
            tickFormatter={(date) => new Date(date).toLocaleDateString()}
          />
          <YAxis stroke="#9fb0c2" tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0f141b',
              border: '1px solid rgba(116, 201, 255, 0.35)',
              borderRadius: '0.5rem',
            }}
            labelStyle={{ color: '#fff' }}
          />
          <Line
            type="monotone"
            dataKey="BP"
            stroke="#ff6b6b"
            name="Bench Press"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="SQ"
            stroke="#4ecdc4"
            name="Squat"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="DL"
            stroke="#ffd93d"
            name="Deadlift"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
