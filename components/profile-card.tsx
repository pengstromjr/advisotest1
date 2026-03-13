"use client";

import type { StudentContext } from "@/lib/course-data";

interface ProfileCardProps {
  studentContext: StudentContext;
  completedCount: number;
  totalCount: number;
  onEditClick: () => void;
}

function ProgressRing({
  percentage,
  size = 64,
  strokeWidth = 5,
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#DAAA00"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-500"
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#002855"
        fontSize={size * 0.26}
        fontWeight="700"
      >
        {percentage}%
      </text>
    </svg>
  );
}

export function ProfileCard({
  studentContext,
  completedCount,
  totalCount,
  onEditClick,
}: ProfileCardProps) {
  const pct =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (!studentContext.major) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <div className="mb-3 flex justify-center text-[#DAAA00]">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
          </svg>
        </div>
        <p className="mb-1 text-sm font-medium text-gray-700 dark:text-slate-200">
          Welcome, Aggie!
        </p>
        <p className="mb-4 text-xs text-gray-400 dark:text-slate-400">
          Set up your profile to track degree progress.
        </p>
        <button
          onClick={onEditClick}
          className="rounded-lg bg-[#002855] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#001a3a]"
        >
          Set up profile
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 p-1">
      {/* Progress ring */}
      <ProgressRing percentage={pct} />

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
          {studentContext.major}
        </p>
        <div className="mt-1 flex items-center gap-2">
          {studentContext.year && (
            <span className="rounded-full bg-[#002855]/8 dark:bg-[#DAAA00]/15 px-2 py-0.5 text-xs font-medium text-[#002855] dark:text-[#DAAA00]">
              {studentContext.year}
            </span>
          )}
          <span className="text-xs text-gray-400 dark:text-slate-400">
            {completedCount}/{totalCount} courses
          </span>
        </div>
        <button
          onClick={onEditClick}
          className="mt-2 text-xs font-medium text-[#002855] dark:text-[#DAAA00] transition-colors hover:text-[#001a3a]"
        >
          Edit profile
        </button>
      </div>
    </div>
  );
}
