'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Calendar } from '@/components/calendar';
import { ProgressChart } from '@/components/progress-chart';
import { NextWorkout } from '@/components/next-workout';
import { NewCycleModal } from '@/components/new-cycle-modal';

interface MainDashboardProps {
  readonly userName: string;
  readonly userPicture: string | null;
}

type CalendarDateItem = {
  date: string;
  lifts: string[];
};

export default function MainDashboard({
  userName,
  userPicture,
}: MainDashboardProps) {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [workoutDays, setWorkoutDays] = useState<CalendarDateItem[]>([]);
  const [showNewCycleModal, setShowNewCycleModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    // Fetch calendar data for current month
    const fetchCalendarData = async () => {
      try {
        const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
        const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

        const res = await fetch(`/api/workouts/calendar?from=${from}&to=${to}`);
        const data = await res.json();

        if (data.dates) {
          setWorkoutDays(data.dates as CalendarDateItem[]);
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

  const userInitial = userName.trim().charAt(0).toUpperCase();

  return (
    <main className="app-canvas min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/settings')}
              className="h-14 w-14 rounded-full border border-white/20 bg-[#0f1216] p-1 shadow-[0_10px_28px_rgba(0,0,0,0.5)] transition-colors hover:border-[#d6ff43]/70"
              title="Abrir configuración"
              aria-label="Abrir configuración"
            >
              {userPicture ? (
                <img
                  src={userPicture}
                  alt={userName}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-[#191f27] text-lg font-semibold text-gray-100">
                  {userInitial}
                </div>
              )}
            </button>
            <div>
              <p className="text-sm text-gray-300">Hola, atleta</p>
              <h1 className="mt-1 text-xl font-bold text-white">{userName}</h1>
            </div>
          </div>
          <p className="pt-1 text-xs tracking-[0.3em] text-gray-400">GymBro</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="space-y-6">
        {/* Calendar and Next Workout Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Calendar */}
          <div>
            {loading ? (
              <div className="panel flex h-96 items-center justify-center p-4">
                <p className="text-gray-400">Cargando calendario...</p>
              </div>
            ) : (
              <Calendar
                year={year}
                month={month}
                workoutDays={workoutDays}
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
            className="flex items-center gap-2 rounded-xl bg-[#d6ff43] px-6 py-3 font-semibold text-gray-900 transition-colors hover:bg-[#c4ec39]"
          >
            <Plus size={20} />
            Generar Plan
          </button>
          <button
            onClick={() => setShowNewCycleModal(true)}
            className="panel-soft flex items-center gap-2 rounded-xl px-6 py-3 font-semibold text-white transition-colors hover:text-[#d6ff43]"
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
