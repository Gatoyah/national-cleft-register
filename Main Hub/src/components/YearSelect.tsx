"use client";

interface YearSelectProps {
  years: number[];
  selectedYear: number;
}

export function YearSelect({ years, selectedYear }: YearSelectProps) {
  return (
    <select
      defaultValue={selectedYear}
      onChange={(e) => {
        window.location.href = `/statistics?year=${e.target.value}`;
      }}
      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
