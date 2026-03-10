"use client";

import { useState, useEffect, useRef } from "react";
import type { StudentContext } from "@/lib/course-data";

interface ProfileEditModalProps {
  open: boolean;
  onClose: () => void;
  context: StudentContext;
  onChange: (ctx: StudentContext) => void;
}

const YEARS = ["", "Freshman", "Sophomore", "Junior", "Senior"];

export function ProfileEditModal({
  open,
  onClose,
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

  useEffect(() => {
    setMajorInput(context.major);
  }, [context.major, open]);

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
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [context.major]);

  const handleMajorInput = (value: string) => {
    setMajorInput(value);
    const lower = value.toLowerCase();
    const filtered = programs.filter((p) => p.toLowerCase().includes(lower));
    setMajorSuggestions(filtered.slice(0, 10));
  };

  const handleMajorFocus = () => {
    setMajorFocused(true);
    if (majorInput.length === 0) {
      setMajorSuggestions(programs.slice(0, 10));
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

  const handleCourseInput = (value: string) => {
    setCourseInput(value);
    if (value.length >= 2) {
      const upper = value.toUpperCase();
      setSuggestions(
        allCourses
          .filter(
            (c) =>
              c.toUpperCase().includes(upper) &&
              !context.completedCourses.includes(c)
          )
          .slice(0, 24)
      );
    } else {
      setSuggestions([]);
    }
  };

  const addCourse = (code: string) => {
    if (!context.completedCourses.includes(code)) {
      onChange({
        ...context,
        completedCourses: [...context.completedCourses, code],
      });
    }
    setCourseInput("");
    setSuggestions([]);
  };

  const removeCourse = (code: string) => {
    onChange({
      ...context,
      completedCourses: context.completedCourses.filter((c) => c !== code),
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
      <div className="relative z-10 mx-4 w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            Edit Student Profile
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
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
            {/* Major */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Major / Program
              </label>
              <div className="relative" ref={majorRef}>
                <div className="relative">
                  <input
                    value={majorInput}
                    onChange={(e) => handleMajorInput(e.target.value)}
                    onFocus={handleMajorFocus}
                    onKeyDown={handleMajorKeyDown}
                    placeholder="Search programs..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-8 text-sm outline-none focus:border-[#002855] focus:ring-2 focus:ring-[#002855]/20"
                  />
                  {context.major && (
                    <button
                      onClick={clearMajor}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label="Clear selection"
                    >
                      &times;
                    </button>
                  )}
                </div>
                {majorFocused && majorSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {majorSuggestions.map((p) => (
                      <button
                        key={p}
                        onMouseDown={() => selectMajor(p)}
                        className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-[#002855]/5 ${
                          p === context.major
                            ? "font-medium text-[#002855]"
                            : "text-gray-700"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Year */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Year
              </label>
              <select
                value={context.year}
                onChange={(e) =>
                  onChange({ ...context, year: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#002855] focus:ring-2 focus:ring-[#002855]/20"
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
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Completed Courses
              </label>
              <div className="relative">
                <input
                  value={courseInput}
                  onChange={(e) => handleCourseInput(e.target.value)}
                  onKeyDown={handleCourseKeyDown}
                  placeholder="Type a course code (e.g., PHI 001)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#002855] focus:ring-2 focus:ring-[#002855]/20"
                />
                {suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2.5 shadow-lg">
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => addCourse(s)}
                          className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:border-[#002855]/30 hover:bg-[#002855]/5 hover:text-[#002855]"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {courseInput.length >= 2 && suggestions.length === 0 && (
                <p className="mt-1.5 text-xs text-gray-400">
                  Press Enter to add &quot;{courseInput.toUpperCase()}&quot;
                </p>
              )}

              {context.completedCourses.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {context.completedCourses.map((code) => (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1 rounded-full bg-[#002855]/10 px-3 py-1.5 text-xs font-medium text-[#002855]"
                    >
                      {code}
                      <button
                        onClick={() => removeCourse(code)}
                        className="ml-0.5 text-[#002855]/50 hover:text-[#002855]"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-400">
                  Add courses you&apos;ve completed to get personalized
                  recommendations.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Nothing is stored. Profile is session-only.
            </p>
            <button
              onClick={onClose}
              className="rounded-lg bg-[#002855] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#001a3a]"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
