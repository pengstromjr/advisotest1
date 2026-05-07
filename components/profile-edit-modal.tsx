"use client";

import { useState, useEffect, useRef } from "react";
import {
  ADVISING_GOALS,
  DEFAULT_ADVISING_GOAL_ID,
  type AdvisingGoalId,
  getAdvisingGoals,
} from "@/lib/advising-goals";
import {
  ACADEMIC_PLANS,
  formatProgramName,
  getAcademicPlan,
  planIncludesMinor,
  planIncludesSecondMajor,
  type AcademicPlanId,
} from "@/lib/academic-plan";
import { normalizeCourseCode } from "@/lib/course-code";
import type { StudentContext } from "@/lib/course-data";

interface ProfileEditModalProps {
  open: boolean;
  onClose: () => void;
  onRestartOnboarding: () => void;
  context: StudentContext;
  onChange: (ctx: StudentContext) => void;
}

const YEARS = ["", "Freshman", "Sophomore", "Junior", "Senior"];
const DEFAULT_CURRENT_MAJOR = "Philosophy, Bachelor of Arts";
const DEFAULT_TARGET_MAJOR = "Economics, Bachelor of Arts";

export function ProfileEditModal({
  open,
  onClose,
  onRestartOnboarding,
  context,
  onChange,
}: ProfileEditModalProps) {
  const [courseInput, setCourseInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [programs, setPrograms] = useState<string[]>([]);
  const [allCourses, setAllCourses] = useState<string[]>([]);

  const [majorInput, setMajorInput] = useState(context.major);
  const [majorSuggestions, setMajorSuggestions] = useState<string[]>([]);
  const [majorFocused, setMajorFocused] = useState(false);
  const majorRef = useRef<HTMLDivElement>(null);
  const [targetMajorInput, setTargetMajorInput] = useState(context.targetMajor || "");
  const [targetMajorSuggestions, setTargetMajorSuggestions] = useState<string[]>([]);
  const [targetMajorFocused, setTargetMajorFocused] = useState(false);
  const targetMajorRef = useRef<HTMLDivElement>(null);
  const [secondaryMajorInput, setSecondaryMajorInput] = useState(context.secondaryMajor || "");
  const [secondaryMajorSuggestions, setSecondaryMajorSuggestions] = useState<string[]>([]);
  const [secondaryMajorFocused, setSecondaryMajorFocused] = useState(false);
  const secondaryMajorRef = useRef<HTMLDivElement>(null);
  const [minorInput, setMinorInput] = useState("");
  const [minorSuggestions, setMinorSuggestions] = useState<string[]>([]);
  const [minorFocused, setMinorFocused] = useState(false);
  const minorRef = useRef<HTMLDivElement>(null);
  const selectedGoalIds = context.advisingGoals?.length
    ? context.advisingGoals
    : context.advisingGoal
      ? [context.advisingGoal]
      : [DEFAULT_ADVISING_GOAL_ID];
  const selectedGoals = getAdvisingGoals(selectedGoalIds);
  const isChangeMajorGoal = selectedGoalIds.includes("change-major");
  const academicPlan = getAcademicPlan(context);
  const showSecondMajor = planIncludesSecondMajor(academicPlan);
  const showMinors = planIncludesMinor(academicPlan);
  const minorPrograms = programs.filter((program) => /\bminor\b/i.test(program));
  const majorPrograms = programs.filter((program) => !/\bminor\b/i.test(program));

  useEffect(() => {
    fetch("/api/data")
      .then((r) => r.json())
      .then((data) => {
        if (data.programs) setPrograms(data.programs);
        if (data.courses) setAllCourses(data.courses);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (majorRef.current && !majorRef.current.contains(e.target as Node)) {
        setMajorFocused(false);
        setMajorSuggestions([]);
        setMajorInput(context.major);
      }
      if (
        targetMajorRef.current &&
        !targetMajorRef.current.contains(e.target as Node)
      ) {
        setTargetMajorFocused(false);
        setTargetMajorSuggestions([]);
        setTargetMajorInput(context.targetMajor || "");
      }
      if (
        secondaryMajorRef.current &&
        !secondaryMajorRef.current.contains(e.target as Node)
      ) {
        setSecondaryMajorFocused(false);
        setSecondaryMajorSuggestions([]);
        setSecondaryMajorInput(context.secondaryMajor || "");
      }
      if (minorRef.current && !minorRef.current.contains(e.target as Node)) {
        setMinorFocused(false);
        setMinorSuggestions([]);
        setMinorInput("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [context.major, context.targetMajor, context.secondaryMajor]);

  const handleMajorInput = (value: string) => {
    setMajorInput(value);
    const lower = value.toLowerCase();
    const filtered = majorPrograms.filter((p) => p.toLowerCase().includes(lower));
    setMajorSuggestions(filtered.slice(0, 10));
  };

  const handleAcademicPlanChange = (plan: AcademicPlanId) => {
    const next: StudentContext = {
      ...context,
      academicPlan: plan,
    };
    if (!planIncludesSecondMajor(plan)) {
      next.secondaryMajor = "";
      setSecondaryMajorInput("");
    }
    if (!planIncludesMinor(plan)) {
      next.minors = [];
      setMinorInput("");
    }
    onChange(next);
  };

  const handleGoalToggle = (goalId: AdvisingGoalId) => {
    const selected = selectedGoalIds.includes(goalId);
    const nextGoalIds = selected
      ? selectedGoalIds.filter((id) => id !== goalId)
      : [...selectedGoalIds, goalId];
    const primaryGoal = nextGoalIds[0];
    const nextContext: StudentContext = {
      ...context,
      advisingGoal: primaryGoal,
      advisingGoals: nextGoalIds,
    };
    if (nextGoalIds.includes("change-major")) {
      nextContext.major = nextContext.major || DEFAULT_CURRENT_MAJOR;
      nextContext.targetMajor = nextContext.targetMajor || DEFAULT_TARGET_MAJOR;
      setMajorInput(nextContext.major);
      setTargetMajorInput(nextContext.targetMajor);
    }
    onChange(nextContext);
  };

  const handleMajorFocus = () => {
    setMajorFocused(true);
    if (majorInput.length === 0) {
      setMajorSuggestions(majorPrograms.slice(0, 10));
    } else {
      handleMajorInput(majorInput);
    }
  };

  const selectMajor = (program: string) => {
    setMajorInput(program);
    setMajorSuggestions([]);
    setMajorFocused(false);
    onChange({ ...context, major: program });
  };

  const clearMajor = () => {
    setMajorInput("");
    setMajorSuggestions([]);
    onChange({ ...context, major: "" });
  };

  const handleTargetMajorInput = (value: string) => {
    setTargetMajorInput(value);
    const lower = value.toLowerCase();
    const filtered = majorPrograms.filter((p) => p.toLowerCase().includes(lower));
    setTargetMajorSuggestions(filtered.slice(0, 10));
  };

  const handleTargetMajorFocus = () => {
    setTargetMajorFocused(true);
    if (targetMajorInput.length === 0) {
      setTargetMajorSuggestions(majorPrograms.slice(0, 10));
    } else {
      handleTargetMajorInput(targetMajorInput);
    }
  };

  const selectTargetMajor = (program: string) => {
    setTargetMajorInput(program);
    setTargetMajorSuggestions([]);
    setTargetMajorFocused(false);
    onChange({ ...context, targetMajor: program });
  };

  const clearTargetMajor = () => {
    setTargetMajorInput("");
    setTargetMajorSuggestions([]);
    onChange({ ...context, targetMajor: "" });
  };

  const handleSecondaryMajorInput = (value: string) => {
    setSecondaryMajorInput(value);
    const lower = value.toLowerCase();
    const filtered = majorPrograms.filter((p) => p.toLowerCase().includes(lower));
    setSecondaryMajorSuggestions(filtered.slice(0, 10));
  };

  const handleSecondaryMajorFocus = () => {
    setSecondaryMajorFocused(true);
    if (secondaryMajorInput.length === 0) {
      setSecondaryMajorSuggestions(majorPrograms.slice(0, 10));
    } else {
      handleSecondaryMajorInput(secondaryMajorInput);
    }
  };

  const selectSecondaryMajor = (program: string) => {
    setSecondaryMajorInput(program);
    setSecondaryMajorSuggestions([]);
    setSecondaryMajorFocused(false);
    onChange({ ...context, secondaryMajor: program });
  };

  const clearSecondaryMajor = () => {
    setSecondaryMajorInput("");
    setSecondaryMajorSuggestions([]);
    onChange({ ...context, secondaryMajor: "" });
  };

  const handleMinorInput = (value: string) => {
    setMinorInput(value);
    const lower = value.toLowerCase();
    const selected = new Set(context.minors || []);
    const filtered = minorPrograms.filter(
      (p) => p.toLowerCase().includes(lower) && !selected.has(p)
    );
    setMinorSuggestions(filtered.slice(0, 10));
  };

  const handleMinorFocus = () => {
    setMinorFocused(true);
    if (minorInput.length === 0) {
      const selected = new Set(context.minors || []);
      setMinorSuggestions(minorPrograms.filter((p) => !selected.has(p)).slice(0, 10));
    } else {
      handleMinorInput(minorInput);
    }
  };

  const addMinor = (program: string) => {
    const minors = context.minors || [];
    if (!minors.includes(program)) {
      onChange({ ...context, minors: [...minors, program] });
    }
    setMinorInput("");
    setMinorSuggestions([]);
    setMinorFocused(false);
  };

  const removeMinor = (program: string) => {
    onChange({
      ...context,
      minors: (context.minors || []).filter((minor) => minor !== program),
    });
  };

  const handleMajorKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (majorSuggestions.length > 0) {
        selectMajor(majorSuggestions[0]);
      }
    } else if (e.key === "Escape") {
      setMajorFocused(false);
      setMajorSuggestions([]);
      setMajorInput(context.major);
    }
  };

  const handleTargetMajorKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (targetMajorSuggestions.length > 0) {
        selectTargetMajor(targetMajorSuggestions[0]);
      } else if (targetMajorInput.trim()) {
        selectTargetMajor(targetMajorInput.trim());
      }
    } else if (e.key === "Escape") {
      setTargetMajorFocused(false);
      setTargetMajorSuggestions([]);
      setTargetMajorInput(context.targetMajor || "");
    }
  };

  const handleSecondaryMajorKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (secondaryMajorSuggestions.length > 0) {
        selectSecondaryMajor(secondaryMajorSuggestions[0]);
      } else if (secondaryMajorInput.trim()) {
        selectSecondaryMajor(secondaryMajorInput.trim());
      }
    } else if (e.key === "Escape") {
      setSecondaryMajorFocused(false);
      setSecondaryMajorSuggestions([]);
      setSecondaryMajorInput(context.secondaryMajor || "");
    }
  };

  const handleMinorKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (minorSuggestions.length > 0) {
        addMinor(minorSuggestions[0]);
      } else if (minorInput.trim()) {
        const query = minorInput.trim().toLowerCase();
        const match = minorPrograms.find((program) => {
          const label = formatProgramName(program).toLowerCase();
          return program.toLowerCase() === query || label === query;
        }) || minorPrograms.find((program) => program.toLowerCase().includes(query));
        addMinor(match || `${minorInput.trim()}, Minor`);
      }
    } else if (e.key === "Escape") {
      setMinorFocused(false);
      setMinorSuggestions([]);
      setMinorInput("");
    }
  };

  const handleCourseInput = (value: string) => {
    setCourseInput(value);
    if (value.length >= 2) {
      const upper = value.toUpperCase();
      const completed = new Set(context.completedCourses.map(normalizeCourseCode));
      setSuggestions(
        allCourses
          .filter(
            (c) =>
              c.toUpperCase().includes(upper) &&
              !completed.has(normalizeCourseCode(c))
          )
          .slice(0, 24)
      );
    } else {
      setSuggestions([]);
    }
  };

  const addCourse = (code: string) => {
    const normalizedCode = normalizeCourseCode(code);
    const completed = new Set(context.completedCourses.map(normalizeCourseCode));
    if (!completed.has(normalizedCode)) {
      onChange({
        ...context,
        completedCourses: [...context.completedCourses, normalizedCode],
      });
    }
    setCourseInput("");
    setSuggestions([]);
  };

  const removeCourse = (code: string) => {
    const normalizedCode = normalizeCourseCode(code);
    onChange({
      ...context,
      completedCourses: context.completedCourses.filter((c) => normalizeCourseCode(c) !== normalizedCode),
    });
  };

  const handleCourseKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const upper = courseInput.trim().toUpperCase();
      if (upper) addCourse(upper);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal card */}
      <div className="relative z-10 mx-4 w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Edit Student Profile
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:text-slate-500"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[85vh] overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            {/* Advising Goal */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
                Advising Goal
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ADVISING_GOALS.map((goal) => (
                  <button
                    key={goal.id}
                    type="button"
                    aria-pressed={selectedGoalIds.includes(goal.id)}
                    onClick={() => handleGoalToggle(goal.id)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                      selectedGoalIds.includes(goal.id)
                        ? "border-[#002855] bg-[#002855]/5 text-[#002855] ring-1 ring-[#DAAA00]/70 dark:border-[#DAAA00] dark:bg-[#DAAA00]/10 dark:text-[#DAAA00]"
                        : "border-gray-200 text-gray-600 hover:border-[#002855]/30 dark:border-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {goal.label}
                  </button>
                ))}
              </div>
              {selectedGoals.length > 0 && (
                <p className="mt-1.5 text-xs text-gray-400 dark:text-slate-500">
                  {selectedGoals.map((goal) => goal.description).join(" ")}
                </p>
              )}
            </div>

            {/* Academic Plan */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
                Academic Plan
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ACADEMIC_PLANS.map((plan) => {
                  const selected = academicPlan === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => handleAcademicPlanChange(plan.id)}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                        selected
                          ? "border-[#002855] bg-[#002855]/5 text-[#002855] shadow-sm ring-1 ring-[#DAAA00]/70 dark:border-[#DAAA00] dark:bg-[#DAAA00]/10 dark:text-[#DAAA00]"
                          : "border-gray-200 text-gray-600 hover:border-[#002855]/30 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span className="block text-xs font-bold">
                        {plan.label}
                      </span>
                      <span
                        className={`mt-0.5 block text-[11px] leading-snug ${
                          selected
                            ? "text-[#002855]/70 dark:text-[#DAAA00]/75"
                            : "text-gray-400 dark:text-slate-500"
                        }`}
                      >
                        {plan.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Major */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
                {isChangeMajorGoal ? "Current Major / Program" : "Major / Program"}
              </label>
              <div className="relative" ref={majorRef}>
                <div className="relative">
                  <input
                    value={majorInput}
                    onChange={(e) => handleMajorInput(e.target.value)}
                    onFocus={handleMajorFocus}
                    onKeyDown={handleMajorKeyDown}
                    placeholder="Search programs..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-8 text-sm outline-none focus:border-[#002855] focus:ring-2 focus:ring-[#002855]/20 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                  />
                  {context.major && (
                    <button
                      onClick={clearMajor}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300"
                      aria-label="Clear selection"
                    >
                      &times;
                    </button>
                  )}
                </div>
                {majorFocused && majorSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:bg-slate-800 dark:border-slate-700 dark:shadow-black/50">
                    {majorSuggestions.map((p) => (
                      <button
                        key={p}
                        onMouseDown={() => selectMajor(p)}
                        className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-[#002855]/5 dark:hover:bg-blue-500/10 ${
                          p === context.major
                            ? "font-medium text-[#002855] dark:text-blue-400"
                            : "text-gray-700 dark:text-slate-300"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {isChangeMajorGoal && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
                  Goal Major
                </label>
                <div className="relative" ref={targetMajorRef}>
                  <div className="relative">
                    <input
                      value={targetMajorInput}
                      onChange={(e) => handleTargetMajorInput(e.target.value)}
                      onFocus={handleTargetMajorFocus}
                      onKeyDown={handleTargetMajorKeyDown}
                      placeholder="Search programs..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-8 text-sm outline-none focus:border-[#002855] focus:ring-2 focus:ring-[#002855]/20 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                    />
                    {context.targetMajor && (
                      <button
                        onClick={clearTargetMajor}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300"
                        aria-label="Clear goal major"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                  {targetMajorFocused && targetMajorSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:bg-slate-800 dark:border-slate-700 dark:shadow-black/50">
                      {targetMajorSuggestions.map((p) => (
                        <button
                          key={p}
                          onMouseDown={() => selectTargetMajor(p)}
                          className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-[#002855]/5 dark:hover:bg-blue-500/10 ${
                            p === context.targetMajor
                              ? "font-medium text-[#002855] dark:text-blue-400"
                              : "text-gray-700 dark:text-slate-300"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {showSecondMajor && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
                  Second Major / Program
                </label>
                <div className="relative" ref={secondaryMajorRef}>
                  <div className="relative">
                    <input
                      value={secondaryMajorInput}
                      onChange={(e) => handleSecondaryMajorInput(e.target.value)}
                      onFocus={handleSecondaryMajorFocus}
                      onKeyDown={handleSecondaryMajorKeyDown}
                      placeholder="Search second major..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-8 text-sm outline-none focus:border-[#002855] focus:ring-2 focus:ring-[#002855]/20 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                    />
                    {context.secondaryMajor && (
                      <button
                        onClick={clearSecondaryMajor}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300"
                        aria-label="Clear second major"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                  {secondaryMajorFocused && secondaryMajorSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:bg-slate-800 dark:border-slate-700 dark:shadow-black/50">
                      {secondaryMajorSuggestions.map((p) => (
                        <button
                          key={p}
                          onMouseDown={() => selectSecondaryMajor(p)}
                          className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-[#002855]/5 dark:hover:bg-blue-500/10 ${
                            p === context.secondaryMajor
                              ? "font-medium text-[#002855] dark:text-blue-400"
                              : "text-gray-700 dark:text-slate-300"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {showMinors && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
                  Minor(s)
                </label>
                <div className="relative" ref={minorRef}>
                  <input
                    value={minorInput}
                    onChange={(e) => handleMinorInput(e.target.value)}
                    onFocus={handleMinorFocus}
                    onKeyDown={handleMinorKeyDown}
                    placeholder="Search minors..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#002855] focus:ring-2 focus:ring-[#002855]/20 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                  />
                  {minorFocused && minorSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:bg-slate-800 dark:border-slate-700 dark:shadow-black/50">
                      {minorSuggestions.map((p) => (
                        <button
                          key={p}
                          onMouseDown={() => addMinor(p)}
                          className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-[#002855]/5 dark:text-slate-300 dark:hover:bg-blue-500/10"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {(context.minors || []).length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(context.minors || []).map((minor) => (
                      <span
                        key={minor}
                        className="inline-flex items-center gap-1 rounded-full bg-[#002855]/10 px-3 py-1.5 text-xs font-medium text-[#002855] dark:bg-blue-500/20 dark:text-blue-400"
                      >
                        {minor}
                        <button
                          type="button"
                          onClick={() => removeMinor(minor)}
                          className="ml-0.5 text-[#002855]/50 hover:text-[#002855] dark:text-blue-400/50 dark:hover:text-blue-400"
                          aria-label={`Remove ${minor}`}
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs text-gray-400 dark:text-slate-500">
                    Add one or more official UC Davis minors to track alongside your major.
                  </p>
                )}
              </div>
            )}

            {/* Year */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
                Year
              </label>
              <select
                value={context.year}
                onChange={(e) =>
                  onChange({ ...context, year: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#002855] focus:ring-2 focus:ring-[#002855]/20 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y || "Select year..."}
                  </option>
                ))}
              </select>
            </div>

            {/* Completed Courses */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
                Completed Courses
              </label>
              <div className="relative">
                <input
                  value={courseInput}
                  onChange={(e) => handleCourseInput(e.target.value)}
                  onKeyDown={handleCourseKeyDown}
                  placeholder="Type a course code (e.g., PHI 001)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#002855] focus:ring-2 focus:ring-[#002855]/20 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                />
                {suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2.5 shadow-lg dark:bg-slate-800 dark:border-slate-700 dark:shadow-black/50">
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => addCourse(s)}
                          className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:border-[#002855]/30 hover:bg-[#002855]/5 hover:text-[#002855] dark:border-slate-700 dark:text-slate-300 dark:hover:border-blue-500/30 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {courseInput.length >= 2 && suggestions.length === 0 && (
                <p className="mt-1.5 text-xs text-gray-400 dark:text-slate-500">
                  Press Enter to add &quot;{courseInput.toUpperCase()}&quot;
                </p>
              )}

              {context.completedCourses.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {context.completedCourses.map((code) => (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1 rounded-full bg-[#002855]/10 px-3 py-1.5 text-xs font-medium text-[#002855] dark:bg-blue-500/20 dark:text-blue-400"
                    >
                      {code}
                      <button
                        onClick={() => removeCourse(code)}
                        className="ml-0.5 text-[#002855]/50 hover:text-[#002855] dark:text-blue-400/50 dark:hover:text-blue-400"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">
                  Add courses you&apos;ve completed to get personalized
                  recommendations.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 dark:border-slate-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs text-gray-400 dark:text-slate-500">
                Nothing is stored. Profile is session-only.
              </p>
              <button
                type="button"
                onClick={onRestartOnboarding}
                className="mt-1 text-xs font-semibold text-[#002855] transition-colors hover:text-[#001a3a] dark:text-blue-400 dark:hover:text-blue-300"
              >
                Return to onboarding
              </button>
            </div>
            <button
              onClick={onClose}
              className="self-end rounded-lg bg-[#002855] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#001a3a] dark:bg-blue-600 dark:hover:bg-blue-700 sm:self-auto"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
