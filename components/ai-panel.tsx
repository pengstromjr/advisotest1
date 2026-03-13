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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Top: profile summary */}
      <div className="shrink-0 border-b border-gray-100 dark:border-slate-700 p-4">
        <ProfileCard
          studentContext={studentContext}
          completedCount={completedCount}
          totalCount={totalCount}
          onEditClick={onEditProfile}
        />
      </div>

      {/* Bottom: chat - takes all remaining space */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Chat studentContext={studentContext} />
      </div>
    </div>
  );
}

