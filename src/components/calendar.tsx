'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarProps {
  year: number;
  month: number; // 0-11
  workoutDates: string[]; // Array of YYYY-MM-DD strings
  onDayClick: (date: string) => void;
  onMonthChange: (year: number, month: number) => void;
}

export function Calendar({
  year,
  month,
  workoutDates,
  onDayClick,
  onMonthChange,
}: CalendarProps) {
  const today = new Date();
  const isCurrentMonth =
    year === today.getFullYear() && month === today.getMonth();
  const currentDay = today.getDate();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const days: (number | null)[] = [];
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
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
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePrevMonth}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
        >
          <ChevronLeft size={20} className="text-gray-400" />
        </button>
        <h3 className="text-lg font-semibold text-white">
          {monthNames[month]} {year}
        </h3>
        <button
          onClick={handleNextMonth}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
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

        {days.map((day, index) => {
          if (day === null) {
            return (
              <div
                key={`empty-${index}`}
                className="aspect-square"
              />
            );
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const hasWorkout = workoutDateSet.has(dateStr);
          const isToday = isCurrentMonth && day === currentDay;

          return (
            <button
              key={day}
              onClick={() => onDayClick(dateStr)}
              className={`aspect-square rounded flex flex-col items-center justify-center relative transition-colors ${
                isToday
                  ? 'bg-[#d6ff43] text-gray-900 font-bold'
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              <span className="text-sm">{day}</span>
              {hasWorkout && (
                <div className="absolute bottom-1 w-1.5 h-1.5 bg-green-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
