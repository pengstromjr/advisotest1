"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ADVISING_GOALS,
  DEFAULT_ADVISING_GOAL_ID,
  type AdvisingGoalId,
  getAdvisingGoal,
} from "@/lib/advising-goals";
import {
  ACADEMIC_PLANS,
  getAcademicPlan,
  planIncludesMinor,
  planIncludesSecondMajor,
  type AcademicPlanId,
} from "@/lib/academic-plan";
import type { StudentContext } from "@/lib/course-data";
import { CURRENT_BLOCKS_STORAGE_KEY } from "@/lib/current-term";
import type { TimeBlock, Weekday } from "@/lib/time-blocks";
import { loadTimeBlocks, saveTimeBlocks, snapTo15Minutes, BLOCK_COLORS } from "@/lib/time-blocks";
import { 
  Cpu, 
  Coins, 
  Beaker, 
  Users, 
  Settings, 
  MessageSquare, 
  Landmark, 
  Palette, 
  BookOpen,
  Search,
  ChevronLeft,
  Check,
  ClipboardCheck,
  FileText,
  Upload,
  X,
  Repeat2,
  CalendarClock,
  Heart,
  Sparkles,
  TrendingUp,
  BadgePlus,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";

interface OnboardingProps {
  open: boolean;
  context: StudentContext;
  onChange: (ctx: StudentContext) => void;
  onComplete: () => void;
}

const POPULAR_MAJORS = [
  { label: "Computer Science", value: "Computer Science, Bachelor of Science" },
  { label: "Economics", value: "Economics, Bachelor of Arts" },
  { label: "Biological Sciences", value: "Biological Sciences, Bachelor of Science" },
  { label: "Psychology", value: "Psychology, Bachelor of Arts" },
  { label: "Mechanical Engineering", value: "Mechanical Engineering, Bachelor of Science" },
  { label: "Communication", value: "Communication, Bachelor of Arts" },
  { label: "Political Science", value: "Political Science, Bachelor of Arts" },
  { label: "Biochemistry & MB", value: "Biochemistry & Molecular Biology, Bachelor of Science" }
];

const DEFAULT_CURRENT_MAJOR = "Philosophy, Bachelor of Arts";
const DEFAULT_TARGET_MAJOR = "Economics, Bachelor of Arts";

const GOAL_ICON_MAP: Record<AdvisingGoalId, LucideIcon> = {
  "stay-on-track": ClipboardCheck,
  "change-major": Repeat2,
  "optimize-schedule": CalendarClock,
  "interest-classes": Heart,
  "explore-classes": Sparkles,
  "boost-gpa": TrendingUp,
  "minor-double-major": BadgePlus,
  "graduation-plan": GraduationCap,
};

function formatProgramName(program: string): string {
  return program.replace(/,\s*(Bachelor|Master|Doctor).+$/i, "").trim();
}

function getMajorIcon(major: string) {
  const m = major.toLowerCase();
  if (m.includes("computer") || m.includes("engineering")) return <Cpu className="h-4 w-4" />;
  if (m.includes("econom") || m.includes("managerial") || m.includes("accounting")) return <Coins className="h-4 w-4" />;
  if (m.includes("bio") || m.includes("animal") || m.includes("chemical")) return <Beaker className="h-4 w-4" />;
  if (m.includes("psych") || m.includes("socio") || m.includes("anthro")) return <Users className="h-4 w-4" />;
  if (m.includes("mech") || m.includes("aero") || m.includes("civil")) return <Settings className="h-4 w-4" />;
  if (m.includes("commun") || m.includes("linguistic")) return <MessageSquare className="h-4 w-4" />;
  if (m.includes("polit") || m.includes("histor") || m.includes("law")) return <Landmark className="h-4 w-4" />;
  if (m.includes("art") || m.includes("design") || m.includes("music")) return <Palette className="h-4 w-4" />;
  return <BookOpen className="h-4 w-4" />;
}

type Step = 0 | 1 | 2 | 3 | 4 | 5;

interface TranscriptFile {
  id: string;
  name: string;
  type: string;
  size: number;
  file: File;
}

const BLOCKS_STORAGE_KEY = CURRENT_BLOCKS_STORAGE_KEY;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
const START_HOUR = 8;
const END_HOUR = 22;
// No snapping: allow blocks to start/end at any minute.
const SLOT_MINUTES = 1;
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDisplayTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hour12 = ((h + 11) % 12) + 1;
  const suffix = h < 12 ? "am" : "pm";
  return `${hour12}:${m.toString().padStart(2, "0")}${suffix}`;
}

function parseTimeToMinutesLocal(time: string): number {
  const [h, m] = time.split(":").map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return START_HOUR * 60;
  return h * 60 + m;
}

function getMinutesFromPointer(clientY: number, rect: DOMRect, snap: boolean = false): number {
  const offset = Math.min(Math.max(clientY - rect.top, 0), rect.height);
  const ratio = rect.height === 0 ? 0 : offset / rect.height;
  let minutesFromStart = Math.round((ratio * TOTAL_MINUTES) / SLOT_MINUTES) * SLOT_MINUTES;
  if (snap) {
    minutesFromStart = snapTo15Minutes(minutesFromStart);
  }
  const absolute = START_HOUR * 60 + minutesFromStart;
  const min = START_HOUR * 60;
  const max = END_HOUR * 60;
  return Math.min(Math.max(absolute, min), max);
}

function getBlockPosition(startTime: string, endTime: string) {
  const start = parseTimeToMinutesLocal(startTime);
  const end = parseTimeToMinutesLocal(endTime);
  const clampedStart = Math.max(start, START_HOUR * 60);
  const clampedEnd = Math.min(end, END_HOUR * 60);
  if (clampedEnd <= clampedStart) {
    return { top: 0, height: 0 };
  }
  const minutesFromStart = clampedStart - START_HOUR * 60;
  const duration = clampedEnd - clampedStart;
  const top = (minutesFromStart / TOTAL_MINUTES) * 100;
  const height = (duration / TOTAL_MINUTES) * 100;
  return { top, height };
}

export function Onboarding({
  open,
  context,
  onChange,
  onComplete,
}: OnboardingProps) {
  const [step, setStep] = useState<Step>(0);
  const [dir, setDir] = useState<"forward" | "back">("forward");
  const [programs, setPrograms] = useState<string[]>([]);
  const [majorInput, setMajorInput] = useState(context.major);
  const [targetMajorInput, setTargetMajorInput] = useState(context.targetMajor || DEFAULT_TARGET_MAJOR);
  const [secondaryMajorInput, setSecondaryMajorInput] = useState(context.secondaryMajor || "");
  const [minorInput, setMinorInput] = useState("");
  const [closing, setClosing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [transcriptFiles, setTranscriptFiles] = useState<TranscriptFile[]>([]);
  const [parsedCodes, setParsedCodes] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const transcriptFileInputRef = useRef<HTMLInputElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);
  const initializedOpenRef = useRef(false);

  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [dragging, setDragging] = useState<{
    dayIdx: number;
    startMinutes: number;
    currentMinutes: number;
    rect: DOMRect;
  } | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editingStart, setEditingStart] = useState("");
  const [editingEnd, setEditingEnd] = useState("");
  const [editingColor, setEditingColor] = useState("");
  const [editingDays, setEditingDays] = useState<Weekday[]>([]);
  const selectedGoalIds = context.advisingGoals ?? (
    context.advisingGoal ? [context.advisingGoal] : [DEFAULT_ADVISING_GOAL_ID]
  );
  const selectedGoalId = selectedGoalIds[0];
  const selectedGoal = getAdvisingGoal(selectedGoalId);
  const isChangeMajorGoal = selectedGoalIds.includes("change-major");
  const academicPlan = getAcademicPlan(context);
  const showSecondMajor = planIncludesSecondMajor(academicPlan);
  const showMinors = planIncludesMinor(academicPlan);
  const hasCompanionProgram = isChangeMajorGoal || showSecondMajor || showMinors;

  useEffect(() => {
    if (!open) {
      initializedOpenRef.current = false;
      return;
    }
    if (initializedOpenRef.current) return;
    initializedOpenRef.current = true;
    setStep(0);
    setDir("forward");
    setMajorInput(context.major || (isChangeMajorGoal ? DEFAULT_CURRENT_MAJOR : ""));
    setTargetMajorInput(context.targetMajor || DEFAULT_TARGET_MAJOR);
    setSecondaryMajorInput(context.secondaryMajor || "");
    setMinorInput("");
    setClosing(false);
    setTranscript("");
    setTranscriptFiles([]);
    setParsedCodes([]);
    setParseError("");

    // Load any previously saved time blocks.
    const existing = loadTimeBlocks(BLOCKS_STORAGE_KEY);
    setTimeBlocks(existing);
    setDragging(null);
    setEditingBlockId(null);
    setEditingLabel("");
  }, [context.major, context.targetMajor, context.secondaryMajor, open, isChangeMajorGoal]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/data")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.programs)) setPrograms(data.programs);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (step === 2) {
      setTimeout(() => inputRef.current?.focus(), 350);
    }
  }, [step]);

  const filteredPrograms = useMemo(() => {
    const majorPrograms = programs.filter((p) => !/\bminor\b/i.test(p));
    const q = majorInput.toLowerCase().trim();
    if (!q) return majorPrograms.slice(0, 20);
    return majorPrograms.filter((p) => p.toLowerCase().includes(q)).slice(0, 20);
  }, [programs, majorInput]);

  const targetFilteredPrograms = useMemo(() => {
    const majorPrograms = programs.filter((p) => !/\bminor\b/i.test(p));
    const q = targetMajorInput.toLowerCase().trim();
    if (!q) return majorPrograms.slice(0, 20);
    return majorPrograms.filter((p) => p.toLowerCase().includes(q)).slice(0, 20);
  }, [programs, targetMajorInput]);

  const secondaryFilteredPrograms = useMemo(() => {
    const majorPrograms = programs.filter((p) => !/\bminor\b/i.test(p));
    const q = secondaryMajorInput.toLowerCase().trim();
    if (!q) return majorPrograms.slice(0, 20);
    return majorPrograms.filter((p) => p.toLowerCase().includes(q)).slice(0, 20);
  }, [programs, secondaryMajorInput]);

  const minorFilteredPrograms = useMemo(() => {
    const selected = new Set(context.minors || []);
    const minorPrograms = programs.filter((p) => /\bminor\b/i.test(p) && !selected.has(p));
    const q = minorInput.toLowerCase().trim();
    if (!q) return minorPrograms.slice(0, 20);
    return minorPrograms.filter((p) => p.toLowerCase().includes(q)).slice(0, 20);
  }, [programs, context.minors, minorInput]);

  if (!open) return null;

  const goTo = (next: Step) => {
    setDir(next > step ? "forward" : "back");
    setStep(next);
  };

  const handleSelectGoal = (goalId: AdvisingGoalId) => {
    const currentlySelected = selectedGoalIds.includes(goalId);
    const nextGoalIds = currentlySelected
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
    if (
      nextGoalIds.includes("minor-double-major") &&
      (!nextContext.academicPlan || nextContext.academicPlan === "single-major")
    ) {
      nextContext.academicPlan = "major-minor";
    }
    onChange(nextContext);
  };

  const handleGoalContinue = () => {
    if (selectedGoalIds.length === 0) {
      onChange({
        ...context,
        advisingGoal: DEFAULT_ADVISING_GOAL_ID,
        advisingGoals: [DEFAULT_ADVISING_GOAL_ID],
        major: context.major || DEFAULT_CURRENT_MAJOR,
        targetMajor: context.targetMajor || DEFAULT_TARGET_MAJOR,
      });
    }
    goTo(2);
  };

  const handleSelectMajor = (program: string) => {
    onChange({ ...context, major: program });
    setMajorInput(program);
    if (!hasCompanionProgram) {
      setTimeout(() => goTo(3), 200);
    }
  };

  const handleSelectTargetMajor = (program: string) => {
    onChange({ ...context, targetMajor: program });
    setTargetMajorInput(program);
  };

  const handleAcademicPlanChange = (plan: AcademicPlanId) => {
    const nextContext: StudentContext = {
      ...context,
      academicPlan: plan,
    };
    if (!planIncludesSecondMajor(plan)) {
      nextContext.secondaryMajor = "";
      setSecondaryMajorInput("");
    }
    if (!planIncludesMinor(plan)) {
      nextContext.minors = [];
      setMinorInput("");
    }
    onChange(nextContext);
  };

  const handleSelectSecondaryMajor = (program: string) => {
    onChange({ ...context, secondaryMajor: program });
    setSecondaryMajorInput(program);
  };

  const handleSelectMinor = (program: string) => {
    const minors = context.minors || [];
    if (!minors.includes(program)) {
      onChange({ ...context, minors: [...minors, program] });
    }
    setMinorInput("");
  };

  const handleRemoveMinor = (program: string) => {
    onChange({
      ...context,
      minors: (context.minors || []).filter((minor) => minor !== program),
    });
  };

  const handleContinueMajor = () => {
    const currentMajor = majorInput.trim();
    const goalMajor = targetMajorInput.trim();
    const secondMajor = secondaryMajorInput.trim();
    if (
      !currentMajor ||
      (isChangeMajorGoal && !goalMajor) ||
      (showSecondMajor && !secondMajor) ||
      (showMinors && !(context.minors || []).length)
    ) {
      return;
    }
    onChange({
      ...context,
      major: currentMajor,
      targetMajor: isChangeMajorGoal ? goalMajor : context.targetMajor,
      secondaryMajor: showSecondMajor ? secondMajor : "",
      minors: showMinors ? context.minors || [] : [],
    });
    setTimeout(() => goTo(3), 200);
  };

  const handleTranscriptFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const accepted = Array.from(fileList).filter((file) => {
      const isAllowed = file.type.startsWith("image/") || file.type === "application/pdf";
      const isSmallEnough = file.size <= 12 * 1024 * 1024;
      return isAllowed && isSmallEnough;
    });

    setTranscriptFiles((prev) => {
      const existing = new Set(prev.map((file) => `${file.name}-${file.size}`));
      const next = accepted
        .filter((file) => !existing.has(`${file.name}-${file.size}`))
        .slice(0, Math.max(0, 4 - prev.length))
        .map((file) => ({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          type: file.type,
          size: file.size,
          file,
        }));
      return [...prev, ...next];
    });

    if (accepted.length !== fileList.length) {
      setParseError("Some files were skipped. Upload images or PDFs under 12 MB each.");
    } else {
      setParseError("");
    }
    if (transcriptFileInputRef.current) {
      transcriptFileInputRef.current.value = "";
    }
  };

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = typeof reader.result === "string" ? reader.result : "";
        resolve(value.includes(",") ? value.split(",")[1] : value);
      };
      reader.onerror = () => reject(new Error("Could not read transcript file."));
      reader.readAsDataURL(file);
    });

  const handleFinish = () => {
    saveTimeBlocks(BLOCKS_STORAGE_KEY, timeBlocks);
    setClosing(true);
    // Use a slightly longer timeout for the fade-out effect, but it's triggered immediately
    setTimeout(onComplete, 500);
  };

  const handleParseTranscript = async () => {
    const text = transcript.trim();
    if (!text && transcriptFiles.length === 0) {
      setParsedCodes([]);
      setParseError("");
      return;
    }
    setParsing(true);
    setParseError("");
    try {
      const files = await Promise.all(
        transcriptFiles.map(async (item) => ({
          name: item.name,
          type: item.type,
          data: await fileToBase64(item.file),
        }))
      );
      const res = await fetch("/api/parse-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, files }),
      });
      if (!res.ok) {
        const err = (await res.json()).catch(() => ({}));
        throw new Error(err?.error || "Failed");
      }
      const data = (await res.json()) as { codes?: string[] };
      const unique = Array.from(new Set((data.codes || []).filter(Boolean)));
      setParsedCodes(unique);

      const merged = Array.from(
        new Set([...(context.completedCourses || []), ...unique])
      );
      onChange({ ...context, completedCourses: merged });

      if (unique.length === 0) {
        setParseError(
          transcriptFiles.length > 0
            ? "No completed course codes were found. Try a clearer PDF/image or paste the transcript text."
            : "No course codes found (e.g. MAT 21A, ECN 001). Try pasting a line that includes department and number."
        );
      }
    } catch (e) {
      setParseError(
        e instanceof Error ? e.message : "Could not read that transcript. You can still edit courses later."
      );
    } finally {
      setParsing(false);
    }
  };

  const slideClass = (target: Step) => {
    if (target === step)
      return "onboarding-panel-current";
    if (dir === "forward")
      return target < step
        ? "onboarding-panel-left"
        : "onboarding-panel-right";
    return target > step
      ? "onboarding-panel-right"
      : "onboarding-panel-left";
  };
  const handleSaveBlock = () => {
    if (!editingBlockId) return;
    setTimeBlocks((prev) =>
      prev.map((b) =>
        b.id === editingBlockId
          ? {
              ...b,
              label: editingLabel || "Busy",
              startTime: editingStart,
              endTime: editingEnd,
              color: editingColor,
              days: editingDays.length > 0 ? editingDays : b.days,
            }
          : b
      )
    );
    setEditingBlockId(null);
  };

  const toggleDay = (day: Weekday) => {
    setEditingDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day) 
        : [...prev, day]
    );
  };

  const currentMajorLabel = context.major ? formatProgramName(context.major) : "";
  const targetMajorLabel = context.targetMajor ? formatProgramName(context.targetMajor) : "";
  const doneSummary =
    isChangeMajorGoal && currentMajorLabel && targetMajorLabel
      ? `${selectedGoal?.label || "Change my major"}: ${currentMajorLabel} to ${targetMajorLabel}`
      : currentMajorLabel
        ? `${selectedGoal ? `${selectedGoal.label} - ` : ""}${currentMajorLabel}`
        : selectedGoal?.label || "Profile ready";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-400 ${
        closing ? "opacity-0 scale-105" : "opacity-100 scale-100"
      }`}
      style={{ background: "linear-gradient(135deg, #002855 0%, #00427a 50%, #005a9e 100%)" }}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-1/2 -left-1/4 h-[800px] w-[800px] rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, #DAAA00 0%, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-1/3 -right-1/4 h-[600px] w-[600px] rounded-full opacity-[0.05]"
          style={{ background: "radial-gradient(circle, #DAAA00 0%, transparent 70%)" }}
        />
      </div>

      <style jsx global>{`
        .onboarding-stage {
          perspective: 1400px;
          transform-style: preserve-3d;
        }

        .onboarding-panel {
          transform-origin: 50% 50%;
          will-change: transform, opacity, filter;
          transition:
            transform 620ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 420ms ease,
            filter 520ms ease;
        }

        .onboarding-panel-current {
          opacity: 1;
          filter: blur(0);
          transform: translate3d(0, 0, 0) rotateY(0) scale(1);
        }

        .onboarding-panel-left {
          opacity: 0;
          filter: blur(10px);
          transform: translate3d(-42%, 8px, -180px) rotateY(14deg) scale(0.94);
        }

        .onboarding-panel-right {
          opacity: 0;
          filter: blur(10px);
          transform: translate3d(42%, 8px, -180px) rotateY(-14deg) scale(0.94);
        }

        .adviso-primary-action,
        .adviso-icon-action,
        .adviso-goal-card,
        .adviso-choice-card {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          transform: translateZ(0);
          will-change: transform, box-shadow;
        }

        .adviso-primary-action {
          transition:
            transform 180ms cubic-bezier(0.2, 0.9, 0.2, 1.15),
            box-shadow 220ms ease,
            background-color 180ms ease;
        }

        .adviso-primary-action::after,
        .adviso-goal-card::after,
        .adviso-choice-card::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          background: radial-gradient(circle at var(--press-x, 50%) var(--press-y, 50%), rgba(218, 170, 0, 0.26), transparent 34%);
          opacity: 0;
          transform: scale(0.82);
          transition: opacity 260ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .adviso-primary-action:hover {
          transform: translateY(-2px) scale(1.01);
        }

        .adviso-primary-action:active,
        .adviso-icon-action:active,
        .adviso-goal-card:active,
        .adviso-choice-card:active {
          transform: translateY(1px) scale(0.975);
        }

        .adviso-primary-action:active::after,
        .adviso-goal-card:active::after,
        .adviso-choice-card:active::after {
          opacity: 1;
          transform: scale(1.35);
          transition-duration: 120ms;
        }

        .adviso-icon-action {
          transition:
            transform 180ms cubic-bezier(0.2, 0.9, 0.2, 1.15),
            background-color 180ms ease,
            color 180ms ease;
        }

        .adviso-icon-action:hover {
          transform: translateX(-2px) scale(1.05);
        }

        .adviso-goal-card {
          animation: goal-reveal 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
          animation-delay: var(--goal-delay, 0ms);
          transition:
            transform 200ms cubic-bezier(0.2, 0.9, 0.2, 1.12),
            border-color 180ms ease,
            box-shadow 220ms ease,
            background-color 180ms ease;
        }

        .adviso-goal-card:hover {
          transform: translateY(-3px) scale(1.006);
          box-shadow: 0 16px 32px rgba(15, 23, 42, 0.1);
        }

        .adviso-check-pop {
          animation: check-pop 260ms cubic-bezier(0.2, 0.9, 0.25, 1.35) both;
        }

        .adviso-progress-dot {
          transition:
            width 300ms cubic-bezier(0.22, 1, 0.36, 1),
            background-color 260ms ease,
            transform 260ms ease,
            opacity 260ms ease;
        }

        .adviso-progress-dot[data-active="true"] {
          transform: scaleX(1.08);
          box-shadow: 0 0 0 5px rgba(218, 170, 0, 0.1);
        }

        .adviso-choice-card {
          transition:
            transform 180ms cubic-bezier(0.2, 0.9, 0.2, 1.12),
            border-color 180ms ease,
            box-shadow 220ms ease,
            background-color 180ms ease;
        }

        .adviso-choice-card:hover {
          transform: translateY(-2px);
        }

        @keyframes goal-reveal {
          from {
            opacity: 0;
            filter: blur(8px);
            transform: translateY(12px) scale(0.97);
          }
          to {
            opacity: 1;
            filter: blur(0);
            transform: translateY(0) scale(1);
          }
        }

        @keyframes check-pop {
          from {
            opacity: 0;
            transform: scale(0.4) rotate(-18deg);
          }
          to {
            opacity: 1;
            transform: scale(1) rotate(0deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .onboarding-panel,
          .adviso-primary-action,
          .adviso-primary-action::after,
          .adviso-icon-action,
          .adviso-goal-card,
          .adviso-goal-card::after,
          .adviso-choice-card,
          .adviso-choice-card::after,
          .adviso-check-pop,
          .adviso-progress-dot {
            animation: none !important;
            transition: none !important;
            transform: none !important;
            filter: none !important;
          }
        }
      `}</style>

      <div className={`relative z-10 w-[calc(100%-2rem)] transition-all duration-400 ${step === 1 ? "max-w-4xl" : step === 2 || step === 3 || step === 4 ? "max-w-3xl" : "max-w-xl"}`}>
        {/* Progress dots - Absolute positioned to not affect card centering */}
        {step > 0 && step < 5 && (
          <div className="absolute -top-12 left-0 right-0 flex items-center justify-center gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                data-active={i === step}
                className={`adviso-progress-dot h-2 rounded-full ${
                  i === step
                    ? "w-8 bg-[#DAAA00]"
                    : i < step
                      ? "w-2 bg-[#DAAA00]/60"
                      : "w-2 bg-white/30"
                }`}
              />
            ))}
          </div>
        )}

        <div
          className={`onboarding-card-shell onboarding-stage relative overflow-hidden rounded-3xl bg-white backdrop-blur-xl shadow-2xl ring-1 ring-white/30 transition-all duration-400 ${
            step === 1
              ? "h-[min(640px,calc(100vh-140px))] min-h-[560px]"
              : step === 3
              ? "min-h-[520px] sm:min-h-[560px]"
              : step === 2 || step === 4
              ? "min-h-[680px]"
              : "min-h-[460px]"
          }`}
        >
          {/* Step 0: Welcome */}
          <div
            className={`onboarding-panel absolute inset-0 flex flex-col items-center justify-center p-8 ${slideClass(0)} ${step !== 0 ? "pointer-events-none" : ""}`}
          >
            <div className="mb-6 flex flex-col items-center">
              <span className="text-4xl font-black tracking-tighter text-[#002855]">Adviso</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome!
            </h1>
            <p className="mt-2 max-w-xs text-center text-sm text-gray-500">
              Let&apos;s set up your AI academic advisor in just a couple of
              quick steps.
            </p>
            <button
              type="button"
              onClick={() => goTo(1)}
              className="adviso-primary-action mt-8 rounded-xl bg-[#002855] px-8 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[#001a3a] hover:shadow-xl"
            >
              Get Started
            </button>
          </div>

          {/* Step 1: Goal */}
          <div
            className={`onboarding-panel absolute inset-0 flex flex-col p-5 sm:p-6 ${slideClass(1)} ${step !== 1 ? "pointer-events-none" : ""}`}
          >
            <div className="mb-1 flex items-start gap-3">
              <button
                type="button"
                onClick={() => goTo(0)}
                className="adviso-icon-action flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Go back"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#DAAA00]">
                  Step 1 of 4
                </p>
                <h2 className="text-xl font-bold leading-tight text-gray-900 sm:text-2xl">
                  What do you want Adviso to help with?
                </h2>
              </div>
            </div>
            <p className="mb-4 px-10 text-sm text-gray-500">
              Choose one or more goals. You can change this later.
            </p>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2 sm:grid-rows-4 sm:overflow-hidden sm:pr-0">
              {ADVISING_GOALS.map((goal, index) => {
                const Icon = GOAL_ICON_MAP[goal.id];
                const selected = selectedGoalIds.includes(goal.id);
                return (
                  <button
                    key={goal.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => handleSelectGoal(goal.id)}
                    style={{ "--goal-delay": `${70 + index * 42}ms` } as CSSProperties}
                    className={`adviso-goal-card group flex min-h-0 items-start gap-2 overflow-hidden rounded-2xl border px-2.5 py-2 text-left sm:gap-3 sm:px-3 sm:py-2.5 ${
                      selected
                        ? "border-[#002855] bg-[#002855]/5 shadow-md ring-2 ring-[#DAAA00]/60"
                        : "border-gray-200 bg-white hover:border-[#DAAA00]/70 hover:shadow-md"
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${
                        selected
                          ? "bg-[#002855] text-[#DAAA00]"
                          : "bg-gray-50 text-[#002855] group-hover:bg-[#002855]/5"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-[13px] font-semibold leading-snug ${selected ? "text-[#002855]" : "text-gray-900"}`}>
                          {goal.label}
                        </p>
                        {selected && (
                          <span className="adviso-check-pop mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#002855]">
                            <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      <p className="mt-1 hidden text-[11.5px] leading-snug text-gray-500 sm:block">
                        {goal.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleGoalContinue}
              disabled={selectedGoalIds.length === 0}
              className="adviso-primary-action mt-4 rounded-xl bg-[#002855] py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-[#001a3a] hover:shadow-xl disabled:cursor-not-allowed disabled:bg-gray-300 disabled:opacity-60"
            >
              Continue
            </button>
          </div>

          {/* Step 2: Major */}
          <div
            className={`onboarding-panel absolute inset-0 flex flex-col p-8 sm:p-10 ${slideClass(2)} ${step !== 2 ? "pointer-events-none" : ""}`}
          >
            <div className="mb-1 flex items-center gap-3">
              <button
                type="button"
                onClick={() => goTo(1)}
                className="adviso-icon-action flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Go back"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#DAAA00]">
                  Step 2 of 4
                </p>
                <h2 className="text-lg font-bold text-gray-900">
                  {isChangeMajorGoal ? "What majors are you comparing?" : "What's your major?"}
                </h2>
              </div>
            </div>
            <p className="mb-6 px-10 text-sm text-gray-500">
              {isChangeMajorGoal
                ? "Tell Adviso where you are now and where you want to go."
                : "We'll use this to personalize your degree audit and course suggestions."}
            </p>

            <div className="mb-4 px-10">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#002855]/60">
                Academic plan
              </p>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {ACADEMIC_PLANS.map((plan) => {
                  const selected = academicPlan === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => handleAcademicPlanChange(plan.id)}
                      className={`rounded-2xl border px-3 py-2 text-left transition-all ${
                        selected
                          ? "border-[#002855] bg-[#002855] text-white shadow-md"
                          : "border-gray-100 bg-white text-gray-600 shadow-sm hover:border-[#002855]/25 hover:text-[#002855]"
                      }`}
                    >
                      <span className="block text-xs font-bold leading-tight">
                        {plan.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={`min-h-0 flex-1 gap-5 px-10 ${hasCompanionProgram ? "grid grid-cols-1 md:grid-cols-2" : "flex flex-col"}`}>
              <div className="flex min-h-0 flex-col">
                <label className="mb-2 text-xs font-bold uppercase tracking-widest text-[#002855]/60">
                  {isChangeMajorGoal ? "Current major" : "Major / Program"}
                </label>
                <div className="relative">
                  <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
                  <input
                    ref={inputRef}
                    value={majorInput}
                    onChange={(e) => setMajorInput(e.target.value)}
                    placeholder="Search all majors & programs..."
                    className="w-full rounded-2xl border border-gray-100 bg-gray-50/50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none shadow-sm transition-all focus:border-[#002855] focus:bg-white focus:ring-4 focus:ring-[#002855]/5"
                  />
                </div>

                {!majorInput.trim() && !isChangeMajorGoal && (
                  <div className="mt-5">
                    <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">Popular Programs</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {POPULAR_MAJORS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => handleSelectMajor(p.value)}
                          className="adviso-choice-card flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 text-left shadow-sm hover:border-[#002855]/30 hover:shadow-md"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#002855]">
                            {getMajorIcon(p.label)}
                          </div>
                          <span className="text-xs font-semibold leading-tight text-gray-800">
                            {p.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {majorInput.trim() && (
                  <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#002855]/60">
                      Results for &quot;{majorInput}&quot;
                    </h3>
                    {filteredPrograms.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-50">
                          <Search className="h-6 w-6 text-gray-300" />
                        </div>
                        <p className="text-sm font-medium text-gray-400">No programs match your search.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 pb-2">
                        {filteredPrograms.map((p) => {
                          const selected = p === context.major;
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => handleSelectMajor(p)}
                              className={`adviso-choice-card group flex items-center gap-4 rounded-2xl border p-4 text-left ${
                                selected
                                  ? "border-[#002855] bg-[#002855]/5 shadow-sm"
                                  : "border-gray-100 bg-white hover:border-gray-200 hover:shadow-md"
                              }`}
                            >
                              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                                selected ? "bg-[#002855] text-[#DAAA00]" : "bg-gray-50 text-gray-400 group-hover:bg-[#002855]/10 group-hover:text-[#002855]"
                              }`}>
                                {getMajorIcon(p)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className={`block text-sm font-semibold leading-snug ${selected ? "text-[#002855]" : "text-gray-800"}`}>
                                  {p}
                                </span>
                              </div>
                              {selected && (
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#002855]">
                                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {isChangeMajorGoal && (
                <div className="flex min-h-0 flex-col">
                  <label className="mb-2 text-xs font-bold uppercase tracking-widest text-[#002855]/60">
                    Goal major
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
                    <input
                      ref={targetInputRef}
                      value={targetMajorInput}
                      onChange={(e) => setTargetMajorInput(e.target.value)}
                      placeholder="Search the major you want..."
                      className="w-full rounded-2xl border border-gray-100 bg-gray-50/50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none shadow-sm transition-all focus:border-[#002855] focus:bg-white focus:ring-4 focus:ring-[#002855]/5"
                    />
                  </div>

                  <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {targetMajorInput.trim() && (
                      <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#002855]/60">
                        Results for &quot;{targetMajorInput}&quot;
                      </h3>
                    )}
                    {targetFilteredPrograms.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-50">
                          <Search className="h-6 w-6 text-gray-300" />
                        </div>
                        <p className="text-sm font-medium text-gray-400">No programs match your search.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 pb-2">
                        {targetFilteredPrograms.map((p) => {
                          const selected = p === context.targetMajor;
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => handleSelectTargetMajor(p)}
                              className={`adviso-choice-card group flex items-center gap-4 rounded-2xl border p-4 text-left ${
                                selected
                                  ? "border-[#002855] bg-[#002855]/5 shadow-sm"
                                  : "border-gray-100 bg-white hover:border-gray-200 hover:shadow-md"
                              }`}
                            >
                              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                                selected ? "bg-[#002855] text-[#DAAA00]" : "bg-gray-50 text-gray-400 group-hover:bg-[#002855]/10 group-hover:text-[#002855]"
                              }`}>
                                {getMajorIcon(p)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className={`block text-sm font-semibold leading-snug ${selected ? "text-[#002855]" : "text-gray-800"}`}>
                                  {p}
                                </span>
                              </div>
                              {selected && (
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#002855]">
                                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {showSecondMajor && (
                <div className="flex min-h-0 flex-col">
                  <label className="mb-2 text-xs font-bold uppercase tracking-widest text-[#002855]/60">
                    Second major
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
                    <input
                      value={secondaryMajorInput}
                      onChange={(e) => setSecondaryMajorInput(e.target.value)}
                      placeholder="Search your second major..."
                      className="w-full rounded-2xl border border-gray-100 bg-gray-50/50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none shadow-sm transition-all focus:border-[#002855] focus:bg-white focus:ring-4 focus:ring-[#002855]/5"
                    />
                  </div>

                  <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {secondaryMajorInput.trim() && (
                      <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#002855]/60">
                        Results for &quot;{secondaryMajorInput}&quot;
                      </h3>
                    )}
                    {secondaryFilteredPrograms.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-50">
                          <Search className="h-6 w-6 text-gray-300" />
                        </div>
                        <p className="text-sm font-medium text-gray-400">No majors match your search.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 pb-2">
                        {secondaryFilteredPrograms.map((p) => {
                          const selected = p === context.secondaryMajor;
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => handleSelectSecondaryMajor(p)}
                              className={`adviso-choice-card group flex items-center gap-4 rounded-2xl border p-4 text-left ${
                                selected
                                  ? "border-[#002855] bg-[#002855]/5 shadow-sm"
                                  : "border-gray-100 bg-white hover:border-gray-200 hover:shadow-md"
                              }`}
                            >
                              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                                selected ? "bg-[#002855] text-[#DAAA00]" : "bg-gray-50 text-gray-400 group-hover:bg-[#002855]/10 group-hover:text-[#002855]"
                              }`}>
                                {getMajorIcon(p)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className={`block text-sm font-semibold leading-snug ${selected ? "text-[#002855]" : "text-gray-800"}`}>
                                  {p}
                                </span>
                              </div>
                              {selected && (
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#002855]">
                                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {showMinors && (
                <div className="flex min-h-0 flex-col">
                  <label className="mb-2 text-xs font-bold uppercase tracking-widest text-[#002855]/60">
                    Minor(s)
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
                    <input
                      value={minorInput}
                      onChange={(e) => setMinorInput(e.target.value)}
                      placeholder="Search minors..."
                      className="w-full rounded-2xl border border-gray-100 bg-gray-50/50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none shadow-sm transition-all focus:border-[#002855] focus:bg-white focus:ring-4 focus:ring-[#002855]/5"
                    />
                  </div>

                  {(context.minors || []).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(context.minors || []).map((minor) => (
                        <span
                          key={minor}
                          className="inline-flex items-center gap-1 rounded-full bg-[#002855]/10 px-3 py-1.5 text-xs font-semibold text-[#002855]"
                        >
                          {formatProgramName(minor)}
                          <button
                            type="button"
                            onClick={() => handleRemoveMinor(minor)}
                            className="ml-0.5 text-[#002855]/50 hover:text-[#002855]"
                            aria-label={`Remove ${minor}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {minorInput.trim() && (
                      <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#002855]/60">
                        Results for &quot;{minorInput}&quot;
                      </h3>
                    )}
                    {minorFilteredPrograms.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-50">
                          <Search className="h-6 w-6 text-gray-300" />
                        </div>
                        <p className="text-sm font-medium text-gray-400">No minors match your search.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 pb-2">
                        {minorFilteredPrograms.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => handleSelectMinor(p)}
                            className="adviso-choice-card group flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 text-left hover:border-gray-200 hover:shadow-md"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-400 transition-colors group-hover:bg-[#002855]/10 group-hover:text-[#002855]">
                              {getMajorIcon(p)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold leading-snug text-gray-800">
                                {p}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end px-10">
              <button
                type="button"
                onClick={handleContinueMajor}
                disabled={
                  !majorInput.trim() ||
                  (isChangeMajorGoal && !targetMajorInput.trim()) ||
                  (showSecondMajor && !secondaryMajorInput.trim()) ||
                  (showMinors && !(context.minors || []).length)
                }
                className="adviso-primary-action rounded-xl bg-[#002855] px-6 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-[#001a3a] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next Step
              </button>
            </div>
          </div>

          {/* Step 3: Transcript */}
          <div
            className={`onboarding-panel absolute inset-0 flex flex-col p-5 sm:p-10 ${slideClass(3)} ${
              step !== 3 ? "pointer-events-none" : ""
            }`}
          >
            <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
              <div className="mb-3 flex items-start gap-3 sm:mb-6 sm:gap-4">
                <button
                  type="button"
                  onClick={() => goTo(2)}
                  className="adviso-icon-action mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Go back"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#DAAA00]">
                    Step 3 of 4
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold leading-tight text-gray-900 sm:text-xl">
                      Add your unofficial transcript
                    </h2>
                    <span className="rounded-full bg-[#DAAA00]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8A6A00]">
                      Optional
                    </span>
                  </div>
                  <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-gray-500 sm:text-sm">
                    Paste text or upload a PDF/image. Adviso will scan it for
                    completed courses like ECN 001 and MAT 021B.
                  </p>
                </div>
              </div>

              <div className="flex flex-col rounded-3xl border border-gray-100 bg-white/70 p-3 shadow-sm sm:p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <label className="text-xs font-bold uppercase tracking-widest text-[#002855]/60">
                    Transcript
                  </label>
                  <span className="hidden text-xs font-medium text-gray-400 md:block">
                    PDF, image, or pasted text
                  </span>
                </div>

                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Copy and paste text from your unofficial transcript here..."
                  className="h-20 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50/70 p-4 text-sm leading-relaxed text-gray-800 outline-none transition-colors focus:border-[#002855] focus:bg-white focus:ring-4 focus:ring-[#002855]/10 sm:h-28"
                />

                <div className="mt-3 rounded-2xl border border-dashed border-[#002855]/20 bg-[#002855]/[0.02] p-3">
                  <input
                    ref={transcriptFileInputRef}
                    type="file"
                    accept="application/pdf,image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => handleTranscriptFiles(event.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => transcriptFileInputRef.current?.click()}
                    className="adviso-choice-card flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left shadow-sm hover:border-[#DAAA00]/60 hover:bg-[#fffaf0]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#002855] text-white">
                      <Upload className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900">
                        Upload transcript files
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-gray-500">
                        Add up to 4 PDFs or screenshots. Adviso uses AI vision
                        to read them.
                      </span>
                    </span>
                  </button>

                  {transcriptFiles.length > 0 && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {transcriptFiles.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs shadow-sm"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-[#002855]">
                            <FileText className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-gray-700">
                              {item.name}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {(item.size / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setTranscriptFiles((prev) =>
                                prev.filter((file) => file.id !== item.id)
                              )
                            }
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            aria-label={`Remove ${item.name}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
                  <button
                    type="button"
                    onClick={handleParseTranscript}
                    disabled={parsing || (!transcript.trim() && transcriptFiles.length === 0)}
                    className="adviso-primary-action inline-flex items-center gap-2 rounded-xl bg-[#002855] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#001a3a] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-70"
                  >
                    {parsing ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Scanning
                      </>
                    ) : (
                      <>
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        Scan transcript
                      </>
                    )}
                  </button>
                  <div className="ml-auto flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => goTo(4)}
                      className="text-xs font-semibold text-gray-400 transition-colors hover:text-gray-600"
                    >
                      Skip this step
                    </button>
                    <button
                      type="button"
                      onClick={() => goTo(4)}
                      className="adviso-primary-action rounded-xl bg-[#002855] px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-[#001a3a] hover:shadow-xl sm:px-7 sm:py-2.5"
                    >
                      Next Step
                    </button>
                  </div>
                </div>
              </div>

              {parseError && (
                <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                  {parseError}
                </p>
              )}

              {parsedCodes.length > 0 && (
                <div className="mt-3 rounded-2xl border border-green-100 bg-green-50 p-3 text-xs text-gray-700">
                  <p className="mb-2 font-semibold text-green-700">
                    Detected {parsedCodes.length} completed course
                    {parsedCodes.length > 1 ? "s" : ""}:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {parsedCodes.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-800 shadow-sm"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-gray-500">
                    You can always edit this list later from the profile panel
                    or degree audit.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div
            className={`onboarding-panel absolute inset-0 flex flex-col p-6 ${slideClass(4)} ${
              step !== 4 ? "pointer-events-none" : ""
            }`}
          >
            <div className="mb-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => goTo(3)}
                className="adviso-icon-action flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Go back"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#DAAA00]">
                  Step 4 of 4
                </p>
                <h2 className="text-lg font-bold text-gray-900">
                  Block out times (optional)
                </h2>
              </div>
            </div>

            <p className="mb-6 px-10 text-sm text-gray-500">
              Click &amp; drag on a day column to block out busy times.
            </p>

            <div className="min-h-0 flex-1 px-4">
              <div className="flex h-full flex-col rounded-2xl border border-gray-100 bg-white/60 p-2 shadow-sm">
                <div className="flex flex-1 gap-0">
                  {/* Time Labels */}
                  <div className="flex w-12 shrink-0 flex-col pr-2 text-right text-[10px] text-gray-400">
                    {/* Spacer for day header height */}
                    <div className="h-[1.75rem]" /> 
                    <div className="relative flex-1">
                      {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => {
                        const hour = START_HOUR + i;
                        const label = `${hour <= 12 ? hour : hour - 12}${hour < 12 ? "am" : "pm"}`;
                        return (
                          <div 
                            key={hour} 
                            className="absolute left-0 right-0 flex items-start justify-end pr-1.5"
                            style={{ top: `${(i / (END_HOUR - START_HOUR)) * 100}%` }}
                          >
                            <span className="-mt-1.5">{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Day Columns */}
                  <div className="flex flex-1 gap-1">
                    {DAYS.map((day, dayIdx) => (
                      <div
                        key={day}
                        className="relative flex flex-1 flex-col rounded-lg border border-gray-200/60 bg-white"
                        onMouseDown={(e) => {
                          if (e.button !== 0) return;
                          // Use the grid div (e.currentTarget.lastElementChild) for the rect
                          const gridDiv = e.currentTarget.lastElementChild as HTMLDivElement;
                          const rect = gridDiv.getBoundingClientRect();
                          const startMinutes = getMinutesFromPointer(e.clientY, rect, true);
                          setDragging({
                            dayIdx,
                            startMinutes,
                            currentMinutes: startMinutes,
                            rect,
                          });
                        }}
                        onMouseMove={(e) => {
                          if (!dragging || dragging.dayIdx !== dayIdx) return;
                          const rect = dragging.rect;
                          const currentMinutes = getMinutesFromPointer(e.clientY, rect, true);
                          setDragging((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  currentMinutes,
                                }
                              : prev
                          );
                        }}
                        onMouseUp={(e) => {
                          if (!dragging || dragging.dayIdx !== dayIdx) return;
                          const rect = dragging.rect;
                          const endMinutes = getMinutesFromPointer(e.clientY, rect, true);
                          const start = Math.min(dragging.startMinutes, endMinutes);
                          const end = Math.max(dragging.startMinutes, endMinutes);
                          if (end <= start) {
                            setDragging(null);
                            return;
                          }
                          const newBlock: TimeBlock = {
                            id: `${Date.now().toString(36)}-${Math.random()
                              .toString(36)
                              .slice(2, 8)}`,
                            label: "Busy",
                            color: BLOCK_COLORS[0].bg,
                            days: [DAYS[dayIdx]],
                            startTime: minutesToTime(start),
                            endTime: minutesToTime(end),
                          };
                          setTimeBlocks((prev) => [...prev, newBlock]);
                          setEditingBlockId(newBlock.id);
                          setEditingLabel(newBlock.label || "Busy");
                          setEditingStart(newBlock.startTime);
                          setEditingEnd(newBlock.endTime);
                          setEditingColor(newBlock.color || BLOCK_COLORS[0].bg);
                          setDragging(null);
                        }}
                        onMouseLeave={(e) => {
                          if (!dragging || dragging.dayIdx !== dayIdx) return;
                          const rect = dragging.rect;
                          const currentMinutes = getMinutesFromPointer(e.clientY, rect, true);
                          setDragging((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  currentMinutes,
                                }
                              : prev
                          );
                        }}
                      >
                        <div className="border-b border-gray-100 bg-white/80 h-[1.75rem] flex items-center justify-center text-[11px] font-semibold text-gray-600">
                          {day}
                        </div>
                        <div className="relative flex-1">
                          {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                            <div
                              key={i}
                              className="absolute left-0 right-0 border-b border-dashed border-gray-100/50"
                              style={{
                                top: `${(i / (END_HOUR - START_HOUR)) * 100}%`,
                              }}
                            />
                          ))}

                          {timeBlocks
                            .filter((b) => b.days.includes(day))
                            .map((b) => {
                              const { top, height } = getBlockPosition(b.startTime, b.endTime);
                              if (height <= 0) return null;
                              return (
                                <div
                                  key={b.id}
                                  className="absolute left-1 right-1 rounded-md border text-[10px] leading-tight shadow-md transition-all z-20"
                                  style={{ 
                                    top: `${top}%`, 
                                    height: `${height}%`,
                                    backgroundColor: b.color || BLOCK_COLORS[0].bg,
                                    borderColor: BLOCK_COLORS.find(c => c.bg === b.color)?.border || "#6366F1",
                                    color: BLOCK_COLORS.find(c => c.bg === b.color)?.text || "#1E1B4B"
                                  }}
                                  onClick={() => {
                                    setEditingBlockId(b.id);
                                    setEditingLabel(b.label || "Busy");
                                    setEditingStart(b.startTime);
                                    setEditingEnd(b.endTime);
                                    setEditingColor(b.color || BLOCK_COLORS[0].bg);
                                    setEditingDays(b.days);
                                  }}
                                >
                                  <div className="flex h-full flex-col justify-between p-1">
                                    <div className="flex items-start justify-between gap-1 overflow-hidden">
                                      <span className="truncate font-bold">
                                        {b.label || "Busy"}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setTimeBlocks((prev) =>
                                            prev.filter((tb) => tb.id !== b.id)
                                          );
                                          if (editingBlockId === b.id) {
                                            setEditingBlockId(null);
                                          }
                                        }}
                                        className="ml-1 rounded bg-white/70 px-1 text-[9px] text-gray-500 hover:bg-white hover:text-gray-700"
                                      >
                                        ×
                                      </button>
                                    </div>
                                    <span className="text-[9px] text-gray-600">
                                      {formatDisplayTime(parseTimeToMinutesLocal(b.startTime))}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}

                          {dragging && dragging.dayIdx === dayIdx && (() => {
                            const start = Math.min(dragging.startMinutes, dragging.currentMinutes);
                            const end = Math.max(dragging.startMinutes, dragging.currentMinutes);
                            if (end <= start) return null;
                            const { top, height } = getBlockPosition(
                              minutesToTime(start),
                              minutesToTime(end)
                            );
                            return (
                              <div
                                className="pointer-events-none absolute left-1 right-1 rounded-md border-2 border-dashed border-[#002855]/60 bg-[#002855]/10"
                                style={{ top: `${top}%`, height: `${height}%` }}
                              />
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Selected blocks footer */}
            {timeBlocks.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5 px-8">
                {timeBlocks.map((b) => (
                  <span
                    key={b.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] text-gray-700 shadow-sm"
                  >
                    <span className="font-semibold">{b.label}</span>
                    <button
                      type="button"
                      onClick={() => setTimeBlocks(prev => prev.filter(tb => tb.id !== b.id))}
                      className="ml-0.5 rounded-full text-gray-400 hover:text-gray-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="mt-auto flex items-center gap-3 px-8 py-6">
              <button
                type="button"
                onClick={() => {
                  saveTimeBlocks(BLOCKS_STORAGE_KEY, timeBlocks);
                  goTo(5);
                }}
                className="adviso-primary-action rounded-xl bg-[#002855] px-8 py-4 text-sm font-bold text-white shadow-xl hover:bg-[#001a3a]"
              >
                Finish Setup
              </button>
              <button
                type="button"
                onClick={() => {
                  saveTimeBlocks(BLOCKS_STORAGE_KEY, []);
                  goTo(5);
                }}
                className="text-xs font-medium text-gray-400 hover:text-gray-600"
              >
                Skip
              </button>
              <span className="ml-auto text-[11px] text-gray-400">
                {timeBlocks.length} block{timeBlocks.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {/* Step 5: Done */}
          <div
            className={`onboarding-panel absolute inset-0 flex flex-col items-center justify-center p-8 ${slideClass(5)} ${
              step !== 5 ? "pointer-events-none" : ""
            }`}
          >
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-8 w-8 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              You&apos;re all set!
            </h2>
            <p className="mt-2 max-w-xs text-center text-sm text-gray-500">
              {doneSummary}
            </p>
            {parsedCodes.length > 0 && (
              <p className="mt-1 max-w-xs text-center text-xs text-gray-400">
                We also pre-filled{" "}
                <span className="font-semibold">
                  {parsedCodes.length} completed course
                  {parsedCodes.length > 1 ? "s" : ""}
                </span>{" "}
                from your transcript.
              </p>
            )}
            <p className="mt-1 text-xs text-gray-400">
              You can edit this anytime from the profile panel.
            </p>
            <button
              type="button"
              onClick={handleFinish}
              className="adviso-primary-action mt-6 rounded-xl bg-[#002855] px-8 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[#001a3a] hover:shadow-xl"
            >
              Start Exploring
            </button>
          </div>
        </div>

        {/* Edit Block Modal */}
        {editingBlockId && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center p-6 backdrop-blur-md bg-white/20">
            <div 
              className="absolute inset-0" 
              onClick={() => setEditingBlockId(null)} 
            />
            <div className="relative w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in duration-300">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900 text-center">Edit Time Block</h3>
                <p className="text-sm text-gray-500 text-center mt-1">Customize your busy period</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#002855]/70 dark:text-slate-400 mb-1.5 block px-1">Label</label>
                  <input
                    type="text"
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white font-bold outline-none focus:border-[#002855] focus:ring-4 focus:ring-[#002855]/5 transition-all placeholder:text-gray-300"
                    placeholder="e.g. Lab, Work, Gym..."
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {["Busy", "Work", "Lab", "Club", "Gym"].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setEditingLabel(preset)}
                        className={`rounded-full px-3 py-1 text-[10px] font-bold transition-all ${
                          editingLabel === preset 
                            ? "bg-[#002855] text-white shadow-md shadow-blue-900/20" 
                            : "bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-slate-700 dark:hover:text-white"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-[#002855]/70 dark:text-slate-400 mb-1.5 block px-1">Start Time</label>
                    <select
                      value={editingStart}
                      onChange={(e) => setEditingStart(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white font-bold outline-none focus:border-[#002855] focus:ring-4 focus:ring-[#002855]/5 transition-all"
                    >
                      {Array.from({ length: (END_HOUR - START_HOUR) * 4 }, (_, i) => {
                        const mins = START_HOUR * 60 + i * 15;
                        const t = minutesToTime(mins);
                        return <option key={t} value={t}>{formatDisplayTime(mins)}</option>;
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-[#002855]/70 dark:text-slate-400 mb-1.5 block px-1">End Time</label>
                    <select
                      value={editingEnd}
                      onChange={(e) => setEditingEnd(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white font-bold outline-none focus:border-[#002855] focus:ring-4 focus:ring-[#002855]/5 transition-all"
                    >
                      {Array.from({ length: (END_HOUR - START_HOUR) * 4 }, (_, i) => {
                        const mins = START_HOUR * 60 + (i + 1) * 15;
                        const t = minutesToTime(mins);
                        return <option key={t} value={t}>{formatDisplayTime(mins)}</option>;
                      })}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#002855]/70 dark:text-slate-400 mb-2.5 block px-1">Repeat On</label>
                  <div className="flex justify-between items-center gap-1.5 bg-gray-50 dark:bg-slate-800/50 p-1.5 rounded-2xl border border-gray-100 dark:border-slate-800">
                    {DAYS.map((day) => {
                      const isSelected = editingDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`flex-1 flex h-10 items-center justify-center rounded-xl text-[11px] font-black transition-all duration-200 ${
                            isSelected
                              ? "bg-[#002855] text-white shadow-md shadow-blue-900/10 scale-[1.05] z-10"
                              : "bg-transparent text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 scale-100"
                          }`}
                        >
                          {day.charAt(0)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-2 block text-center">Theme Color</label>
                  <div className="flex justify-center gap-3">
                    {BLOCK_COLORS.map((c) => (
                      <button
                        key={c.bg}
                        type="button"
                        onClick={() => setEditingColor(c.bg)}
                        className={`group relative h-10 w-10 overflow-hidden rounded-xl transition-all hover:scale-110 active:scale-95 ${
                          editingColor === c.bg ? "ring-2 ring-[#002855] ring-offset-2 scale-110" : "ring-1 ring-black/5"
                        }`}
                        style={{ backgroundColor: c.bg }}
                      >
                        {editingColor === c.bg && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/5">
                            <Check className="h-5 w-5 text-[#1E1B4B]" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingBlockId(null)}
                    className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveBlock}
                    className="flex-1 rounded-xl bg-[#002855] py-3 text-sm font-semibold text-white shadow-lg hover:bg-[#001a3a] transition-all"
                  >
                    Save Changes
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setTimeBlocks(prev => prev.filter(b => b.id !== editingBlockId));
                    setEditingBlockId(null);
                  }}
                  className="w-full text-xs font-semibold text-red-400 hover:text-red-600 transition-colors mt-2"
                >
                  Delete Block
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Skip link - Absolute positioned to not affect card centering */}
        <div className="absolute -bottom-12 left-0 right-0 text-center">
          <button
            type="button"
            onClick={handleFinish}
            className="text-xs font-medium text-white/60 transition-colors hover:text-white/90"
          >
            Skip setup for now
          </button>
        </div>
      </div>
    </div>
  );
}
