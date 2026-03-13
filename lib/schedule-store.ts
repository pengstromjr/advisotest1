/**
 * Lightweight pub/sub for cross-component schedule operations.
 * The schedule planner subscribes; course cards in chat publish.
 */

import type { Section } from "./course-data";

type Listener = (section: Section) => void;

const listeners = new Set<Listener>();

export function subscribeScheduleAdd(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function dispatchScheduleAdd(section: Section) {
  listeners.forEach((fn) => fn(section));
}

const STORAGE_KEY = "ucd-ai-schedule-spring-2026";

export function getPlannedCrns(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const sections = JSON.parse(raw) as { crn: string }[];
    return new Set(sections.map((s) => s.crn));
  } catch {
    return new Set();
  }
}
