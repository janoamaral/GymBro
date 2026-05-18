'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarProps {
  readonly year: number;
  readonly month: number; // 0-11
  readonly workoutDates: string[]; // Array of YYYY-MM-DD strings
  readonly onDayClick: (date: string) => void;
  readonly onMonthChange: (year: number, month: number) => void;
}

export function Calendar({
  year,
  month,
  workoutDates,
  onDayClick,
  onMonthChange,
}: Readonly<CalendarProps>) {
  const today = new Date();
  const isCurrentMonth =
    year === today.getFullYear() && month === today.getMonth();
  const currentDay = today.getDate();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const days: Array<{ key: string; day: number | null }> = [];
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push({ key: `empty-${year}-${month}-${i}`, day: null });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ key: `day-${year}-${month}-${i}`, day: i });
  }

  const workoutDateSet = new Set(workoutDates);

  const handlePrevMonth = () => {
    if (month === 0) {
      onMonthChange(year - 1, 11);
    } else {
      onMonthChange(year, month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      onMonthChange(year + 1, 0);
    } else {
      onMonthChange(year, month + 1);
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePrevMonth}
          className="rounded-lg border border-white/10 bg-[#101419] p-1 transition-colors hover:border-[#d6ff43]/45"
          title="Previous month"
          aria-label="Previous month"
        >
          <ChevronLeft size={20} className="text-gray-400" />
        </button>
        <h3 className="text-lg font-semibold text-white">
          {monthNames[month]} {year}
        </h3>
        <button
          onClick={handleNextMonth}
          className="rounded-lg border border-white/10 bg-[#101419] p-1 transition-colors hover:border-[#d6ff43]/45"
          title="Next month"
          aria-label="Next month"
        >
          <ChevronRight size={20} className="text-gray-400" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="text-xs font-semibold text-gray-400 py-2">
            {day}
          </div>
        ))}

        {days.map(({ key, day }) => {
          if (day === null) {
            return (
              <div
                key={key}
                className="aspect-square"
              />
            );
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const hasWorkout = workoutDateSet.has(dateStr);
          const isToday = isCurrentMonth && day === currentDay;

          return (
            <button
              key={key}
              onClick={() => onDayClick(dateStr)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-xl border border-white/10 transition-colors ${
                isToday
                  ? 'bg-[#d6ff43] text-gray-900 font-bold shadow-[0_0_24px_rgba(214,255,67,0.45)]'
                  : 'bg-[#12171d] text-white hover:border-[#74c9ff]/45 hover:bg-[#151d25]'
              }`}
            >
              <span className="text-sm">{day}</span>
              {hasWorkout && (
                <div className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-green-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
