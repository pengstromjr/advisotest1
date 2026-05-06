"use client";

import { ChevronDown, Route } from "lucide-react";

interface RequirementPathSelectorProps {
  paths: string[];
  selectedPath: string;
  onSelectPath: (path: string) => void;
}

export function cleanRequirementPathLabel(path: string) {
  return path
    .replace(/^Specialization:\s*/i, "")
    .replace(/^Track\s+\d+:\s*/i, "")
    .replace(/^Option\s+\d+:\s*/i, "")
    .replace(/\s+Emphasis$/i, "")
    .trim();
}

export function requirementPathKind(paths: string[]) {
  const text = paths.join(" ");
  if (/\bspecialization\b/i.test(text)) return "specialization";
  if (/\bemphasis\b/i.test(text)) return "emphasis";
  if (/\btrack\b/i.test(text)) return "track";
  if (/\boption\b/i.test(text)) return "option";
  return "path";
}

export function pathKindWithArticle(kind: string) {
  return /^[aeiou]/i.test(kind) ? `an ${kind}` : `a ${kind}`;
}

function titleForKind(kind: string) {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function RequirementPathSelector({
  paths,
  selectedPath,
  onSelectPath,
}: RequirementPathSelectorProps) {
  const kind = requirementPathKind(paths);
  const selectedLabel = cleanRequirementPathLabel(selectedPath);

  return (
    <div className="border-b border-gray-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3 dark:border-slate-800 dark:from-slate-950 dark:to-slate-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#002855] text-white shadow-sm dark:bg-blue-600">
            <Route className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#DAAA00]">
              Requirement path
            </p>
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">
              {titleForKind(kind)}: {selectedLabel}
            </p>
          </div>
        </div>

        <div className="relative w-full sm:w-[21rem] lg:w-[24rem]">
          <select
            value={selectedPath}
            onChange={(event) => onSelectPath(event.target.value)}
            className="h-11 w-full appearance-none rounded-xl border border-gray-200 bg-white py-0 pl-3.5 pr-10 text-sm font-semibold text-[#002855] shadow-sm outline-none transition-all hover:border-[#002855]/30 focus:border-[#002855] focus:ring-4 focus:ring-[#002855]/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-500/20"
            aria-label={`Select ${kind}`}
          >
            {paths.map((path) => (
              <option key={path} value={path}>
                {cleanRequirementPathLabel(path)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
        </div>
      </div>
    </div>
  );
}
