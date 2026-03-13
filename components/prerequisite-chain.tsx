"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

type PrereqNode = {
  code: string;
  title: string;
  children: PrereqNode[];
};

type PathStep = { code: string; title: string };

function treeToLeafPaths(root: PrereqNode): PathStep[][] {
  const paths: PathStep[][] = [];
  const dfs = (node: PrereqNode, path: PathStep[]) => {
    const kids = node.children || [];
    if (kids.length === 0) {
      if (path.length > 0) paths.push(path);
      return;
    }
    for (const c of kids) dfs(c, [...path, { code: c.code, title: c.title }]);
  };
  for (const c of root.children || []) dfs(c, [{ code: c.code, title: c.title }]);
  return paths;
}

function pickPrimaryPath(paths: PathStep[][], completedSet: Set<string>): PathStep[] {
  if (paths.length === 0) return [];
  const score = (p: PathStep[]) =>
    p.reduce((acc, s) => acc + (completedSet.has(s.code.toUpperCase()) ? 1 : 0), 0) * 1000 +
    p.length;
  return paths.reduce((best, p) => (score(p) >= score(best) ? p : best), paths[0]);
}

function truncateChain(steps: PathStep[]): PathStep[] {
  if (steps.length <= 4) return steps;
  return [steps[0], steps[1], { code: "…", title: "More steps" }, steps.at(-1)!];
}

export function PrerequisiteChain({
  courseCode,
  completedCourses,
  defaultExpanded = false,
  maxDepth = 5,
  maxAlternatePaths = 3,
}: {
  courseCode: string;
  completedCourses?: string[];
  defaultExpanded?: boolean;
  maxDepth?: number;
  maxAlternatePaths?: number;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAlternates, setShowAlternates] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState<PrereqNode | null>(null);

  const completedSet = useMemo(
    () =>
      new Set(
        (completedCourses || []).map((c) => c.toUpperCase().replace(/\s+/g, " ").trim())
      ),
    [completedCourses]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setShowAlternates(false);
    fetch(`/api/courses/prereq-chain?code=${encodeURIComponent(courseCode)}&maxDepth=${maxDepth}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: PrereqNode) => { if (!cancelled) setTree(data); })
      .catch(() => { if (!cancelled) setTree(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [courseCode, maxDepth]);

  const hasPrereqs = (tree?.children?.length || 0) > 0;

  const allPaths = useMemo(() => {
    if (!tree) return [];
    const leafPaths = treeToLeafPaths(tree);
    const target: PathStep = { code: tree.code, title: tree.title };
    return leafPaths.map((p) => [...p, target]);
  }, [tree]);

  const primaryPath = useMemo(
    () => (tree ? pickPrimaryPath(allPaths, completedSet) : []),
    [allPaths, completedSet, tree]
  );

  const alternatePaths = useMemo(() => {
    if (!tree) return [];
    const key = primaryPath.map((s) => s.code).join(">");
    return allPaths
      .filter((p) => p.map((s) => s.code).join(">") !== key)
      .slice(0, maxAlternatePaths);
  }, [allPaths, maxAlternatePaths, primaryPath, tree]);

  const displayPath = useMemo(() => truncateChain(primaryPath), [primaryPath]);

  const previewText = useMemo(
    () => displayPath.map((s) => s.code).join("  →  "),
    [displayPath]
  );

  if (loading || !hasPrereqs) return null;

  return (
    <div>
      {/* Trigger row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="group flex min-w-0 items-center gap-2 text-left"
      >
        <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 transition-colors group-hover:text-gray-600">
          <svg
            className={`h-3 w-3 shrink-0 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Prereqs
        </span>

        {!expanded && (
          <span className="min-w-0 truncate text-[11px] text-gray-400 transition-colors group-hover:text-gray-600">
            {previewText}
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {/* Primary pathway card */}
          <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm">
            {/* Header label */}
            <div className="border-b border-gray-100 bg-gray-50/70 px-3 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                Required pathway
              </span>
            </div>

            {/* Chips */}
            <div className="flex flex-wrap items-center gap-0 px-3 py-3">
              {primaryPath.map((step, j) => {
                const isEllipsis = step.code === "…";
                const done = !isEllipsis && completedSet.has(step.code.toUpperCase());
                const isTarget = tree && step.code === tree.code;

                return (
                  <Fragment key={`${step.code}-${j}`}>
                    {j > 0 && (
                      <div className="mx-1.5 flex items-center">
                        <svg
                          className="h-3.5 w-3.5 text-gray-300"
                          viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    )}

                    <span
                      title={`${step.code} — ${step.title}`}
                      className={[
                        "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all duration-150",
                        isEllipsis
                          ? "border border-dashed border-gray-300 text-gray-400"
                          : done
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                            : isTarget
                              ? "bg-[#002855] text-white shadow-md shadow-[#002855]/20"
                              : "border border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-white",
                      ].join(" ")}
                    >
                      {step.code}
                      {done && (
                        <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                  </Fragment>
                );
              })}
            </div>
          </div>

          {/* Alternate paths */}
          {alternatePaths.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowAlternates((v) => !v)}
                className="flex items-center gap-1 text-[11px] font-medium text-gray-500 transition-colors hover:text-gray-700"
              >
                <svg
                  className={`h-3 w-3 transition-transform duration-150 ${showAlternates ? "rotate-90" : ""}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                Alternate path{alternatePaths.length > 1 ? "s" : ""}
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                  {alternatePaths.length}
                </span>
              </button>

              {showAlternates && (
                <div className="mt-1.5 space-y-1.5 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
                  {alternatePaths.map((path, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-0">
                      {path.map((step, j) => {
                        const done = completedSet.has(step.code.toUpperCase());
                        return (
                          <Fragment key={`${step.code}-${j}`}>
                            {j > 0 && (
                              <svg className="mx-1 h-3 w-3 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                            <span
                              title={`${step.code} — ${step.title}`}
                              className={[
                                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium",
                                done
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "border border-gray-200 bg-white text-gray-600",
                              ].join(" ")}
                            >
                              {step.code}
                              {done && (
                                <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>
                          </Fragment>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
