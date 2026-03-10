"use client";

import type { StudentContext } from "@/lib/course-data";
import { ProfileCard } from "./profile-card";
import { Chat } from "./chat";

interface AIPanelProps {
  studentContext: StudentContext;
  completedCount: number;
  totalCount: number;
  onEditProfile: () => void;
}

export function AIPanel({
  studentContext,
  completedCount,
  totalCount,
  onEditProfile,
}: AIPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top: profile summary */}
      <div className="border-b border-gray-100 p-4">
        <ProfileCard
          studentContext={studentContext}
          completedCount={completedCount}
          totalCount={totalCount}
          onEditClick={onEditProfile}
        />
      </div>

      {/* Middle: lightweight recommendations placeholder */}
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Recommendations
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Ask the AI for course suggestions, GE ideas, or schedule help.
          </p>
        </div>
      </div>

      {/* Bottom: chat */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <Chat studentContext={studentContext} />
      </div>
    </div>
  );
}

