'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Calendar } from '@/components/calendar';
import { ProgressChart } from '@/components/progress-chart';
import { NextWorkout } from '@/components/next-workout';
import { NewCycleModal } from '@/components/new-cycle-modal';

interface MainDashboardProps {
  userName: string;
  userPicture: string | null;
}

export default function MainDashboard({
  userName,
  userPicture,
}: MainDashboardProps) {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [workoutDates, setWorkoutDates] = useState<string[]>([]);
  const [showNewCycleModal, setShowNewCycleModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    // Fetch calendar data for current month
    const fetchCalendarData = async () => {
      try {
        const from = new Date(year, month, 1).toISOString().split('T')[0];
        const to = new Date(year, month + 1, 0).toISOString().split('T')[0];

        const res = await fetch(`/api/workouts/calendar?from=${from}&to=${to}`);
        const data = await res.json();

        if (data.dates) {
          setWorkoutDates(data.dates.map((d: any) => d.date));
        }
      } catch (error) {
        console.error('Failed to fetch calendar data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCalendarData();
  }, [year, month]);

  const handleMonthChange = (newYear: number, newMonth: number) => {
    setCurrentDate(new Date(newYear, newMonth));
  };

  const handleDayClick = (date: string) => {
    router.push(`/workout/${date}`);
  };

  const handleNewCycleStart = () => {
    // Reload calendar data
    setCurrentDate(new Date());
    setShowNewCycleModal(false);
  };

  return (
    <main className="min-h-full bg-gray-900 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs tracking-[0.3em] text-gray-400">GymBro</p>
            <h1 className="mt-2 text-4xl font-bold text-white">
              Welcome, {userName}
            </h1>
          </div>
          {userPicture && (
            <img
              src={userPicture}
              alt={userName}
              className="h-12 w-12 rounded-full"
            />
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="space-y-6">
        {/* Calendar and Next Workout Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Calendar */}
          <div>
            {loading ? (
              <div className="bg-gray-800 rounded-lg p-4 h-96 flex items-center justify-center">
                <p className="text-gray-400">Loading calendar...</p>
              </div>
            ) : (
              <Calendar
                year={year}
                month={month}
                workoutDates={workoutDates}
                onDayClick={handleDayClick}
                onMonthChange={handleMonthChange}
              />
            )}
          </div>

          {/* Next Workout */}
          <div>
            <NextWorkout />
          </div>
        </div>

        {/* Progress Chart */}
        <div>
          <ProgressChart />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center">
          <button
            onClick={() => router.push('/plan')}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-[#d6ff43] text-gray-900 font-semibold hover:bg-yellow-400 transition-colors"
          >
            <Plus size={20} />
            Generar Plan
          </button>
          <button
            onClick={() => setShowNewCycleModal(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-green-500 text-white font-semibold hover:bg-green-600 transition-colors"
          >
            <Plus size={20} />
            Nuevo Ciclo
          </button>
        </div>
      </div>

      {/* New Cycle Modal */}
      <NewCycleModal
        isOpen={showNewCycleModal}
        onClose={() => setShowNewCycleModal(false)}
        onStart={handleNewCycleStart}
      />
    </main>
  );
}
