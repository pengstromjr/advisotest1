"use client";

import React from "react";

/**
 * Converts a numerical GPA to a letter grade based on common university scales.
 */
export function gpaToLetter(gpa: number) {
  if (gpa >= 3.85) return "A";
  if (gpa >= 3.5) return "A-";
  if (gpa >= 3.15) return "B+";
  if (gpa >= 2.85) return "B";
  if (gpa >= 2.5) return "B-";
  if (gpa >= 2.15) return "C+";
  if (gpa >= 1.85) return "C";
  if (gpa >= 1.5) return "C-";
  return "D/F";
}

interface GPABadgeProps {
  gpa: number;
  className?: string;
}

/**
 * A reusable badge that displays a letter grade based on a numerical GPA.
 */
export function GPABadge({ gpa, className = "" }: GPABadgeProps) {
  return (
    <div 
      className={`inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 shadow-sm dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300 ${className}`}
      title={`Avg GPA: ${gpa.toFixed(2)}`}
    >
      <span>{gpaToLetter(gpa)}</span>
      <span className="opacity-60 text-[8px]">Grade</span>
    </div>
  );
}
