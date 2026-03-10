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
        <div className="mb-3 text-3xl">🎓</div>
        <p className="mb-1 text-sm font-medium text-gray-700">
          Welcome, Aggie!
        </p>
        <p className="mb-4 text-xs text-gray-400">
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
        <p className="truncate text-sm font-semibold text-gray-900">
          {studentContext.major}
        </p>
        <div className="mt-1 flex items-center gap-2">
          {studentContext.year && (
            <span className="rounded-full bg-[#002855]/8 px-2 py-0.5 text-xs font-medium text-[#002855]">
              {studentContext.year}
            </span>
          )}
          <span className="text-xs text-gray-400">
            {completedCount}/{totalCount} courses
          </span>
        </div>
        <button
          onClick={onEditClick}
          className="mt-2 text-xs font-medium text-[#002855] transition-colors hover:text-[#001a3a]"
        >
          Edit profile
        </button>
      </div>
    </div>
  );
}
