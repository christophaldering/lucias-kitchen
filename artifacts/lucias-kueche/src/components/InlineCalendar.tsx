import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface InlineCalendarProps {
  value: string;
  onChange: (date: string) => void;
  minDate?: string;
}

export default function InlineCalendar({ value, onChange, minDate }: InlineCalendarProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parseDate = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const initialDate = value ? parseDate(value) : today;
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  const minDateObj = minDate ? parseDate(minDate) : today;
  minDateObj.setHours(0, 0, 0, 0);

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
  const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);

  let startWeekday = firstDayOfMonth.getDay();
  startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;

  const daysInMonth = lastDayOfMonth.getDate();

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const isPrevDisabled = () => {
    const prevMonthLastDay = new Date(viewYear, viewMonth, 0);
    return prevMonthLastDay < minDateObj;
  };

  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const handleDayClick = (day: number) => {
    const date = new Date(viewYear, viewMonth, day);
    date.setHours(0, 0, 0, 0);
    if (date < minDateObj) return;
    onChange(toIsoDate(date));
  };

  const selectedObj = value ? parseDate(value) : null;
  if (selectedObj) selectedObj.setHours(0, 0, 0, 0);

  const todayIso = toIsoDate(today);

  return (
    <div className="w-full select-none">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={goToPrevMonth}
          disabled={isPrevDisabled()}
          className="p-1.5 rounded-lg hover:bg-[#4A7C59]/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-foreground"
          aria-label="Vorheriger Monat"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-foreground">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={goToNextMonth}
          className="p-1.5 rounded-lg hover:bg-[#4A7C59]/10 transition-colors text-foreground"
          aria-label="Nächster Monat"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="text-center text-xs font-medium text-muted-foreground py-1"
          >
            {wd}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} />;
          }

          const cellDate = new Date(viewYear, viewMonth, day);
          cellDate.setHours(0, 0, 0, 0);
          const isPast = cellDate < minDateObj;
          const cellIso = toIsoDate(cellDate);
          const isSelected = selectedObj ? cellIso === toIsoDate(selectedObj) : false;
          const isToday = cellIso === todayIso;

          return (
            <button
              key={day}
              type="button"
              onClick={() => handleDayClick(day)}
              disabled={isPast}
              className={`
                w-full aspect-square flex items-center justify-center rounded-lg text-sm transition-colors
                ${isPast
                  ? "text-muted-foreground/40 cursor-not-allowed"
                  : isSelected
                    ? "bg-[#4A7C59] text-white font-semibold shadow-sm"
                    : isToday
                      ? "bg-[#4A7C59]/15 text-[#4A7C59] font-semibold hover:bg-[#4A7C59]/25"
                      : "text-foreground hover:bg-[#4A7C59]/10"
                }
              `}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
