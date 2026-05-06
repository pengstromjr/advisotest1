
"use client";

import { useState, useEffect, useMemo } from "react";
import type { Section, StudentContext } from "@/lib/course-data";
import { isEligible, type CourseMinimal } from "@/lib/eligibility";
import { getStoredPlannedSections, getStoredBlockedTimes, checkTimeConflict } from "@/lib/schedule-state";
import { dispatchScheduleAdd } from "@/lib/schedule-store";
import { DISCOVERY_HUB_NOTICE } from "@/lib/legal-notices";
import {
  Sparkles,
  Flame,
  TrendingUp,
  Gem,
  Beaker,
  Globe,
  GraduationCap,
  Plus,
  Brain,
  BriefcaseBusiness,
  Target,
  SlidersHorizontal,
  X,
  Check,
  Pencil,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { GPABadge } from "./gpa-display";
import { CourseDetailModal } from "./course-detail-modal";
import { SectionPickerModal } from "./section-picker-modal";

interface DiscoveryCategory {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  query: string; // Subject or filter
  kind?: "standard" | "personal";
}

interface PersonalDiscoveryProfile {
  name: string;
  topics: string[];
  careers: string[];
  skills: string[];
  outcomes: string[];
  geGoals: string[];
  workload: "balanced" | "lighter" | "challenge";
  level: "any" | "lower" | "upper";
  format: "any" | "in-person" | "online" | "hybrid";
  customTopics: string[];
}

interface PersonalOption {
  id: string;
  label: string;
  keywords: string[];
  subjects?: string[];
  ge?: string[];
}

const PERSONAL_DISCOVERY_STORAGE_KEY = "adviso-personal-discovery-profile";
const PERSONAL_CATEGORY_ID = "personal-discovery";

const TOPIC_OPTIONS: PersonalOption[] = [
  { id: "ai-data", label: "AI & data", keywords: ["data", "computing", "analytics", "machine", "algorithm"], subjects: ["ECS", "STA", "MAT"] },
  { id: "public-policy", label: "Public policy", keywords: ["policy", "government", "law", "public", "justice"], subjects: ["POL", "SOC", "ECN"] },
  { id: "health-medicine", label: "Health & medicine", keywords: ["health", "medicine", "disease", "biology", "nutrition"], subjects: ["NPB", "BIS", "NUT", "HDE"] },
  { id: "sustainability", label: "Sustainability", keywords: ["environment", "climate", "sustainability", "ecology", "energy"], subjects: ["ESP", "EVE", "HYD", "PLS"] },
  { id: "business", label: "Business & entrepreneurship", keywords: ["business", "management", "market", "finance", "entrepreneur"], subjects: ["MGT", "ECN", "ARE"] },
  { id: "behavior", label: "Behavior & society", keywords: ["behavior", "society", "psychology", "culture", "social"], subjects: ["PSC", "SOC", "ANT", "HDE"] },
  { id: "design-media", label: "Design & media", keywords: ["design", "media", "visual", "creative", "digital"], subjects: ["DES", "CDM", "ART", "CMN"] },
  { id: "global-culture", label: "Global culture", keywords: ["global", "culture", "language", "world", "international"], subjects: ["HIS", "ANT", "COM", "RST"], ge: ["WC", "ACGH"] },
  { id: "science", label: "Science discovery", keywords: ["science", "research", "lab", "chemistry", "physics"], subjects: ["CHE", "PHY", "BIS"], ge: ["SE"] },
  { id: "writing-communication", label: "Writing & communication", keywords: ["writing", "communication", "rhetoric", "language", "argument"], subjects: ["UWP", "ENL", "CMN"], ge: ["WE", "AH"] },
];

const CAREER_OPTIONS: PersonalOption[] = [
  { id: "software-data", label: "Software / data", keywords: ["programming", "data", "systems", "analytics"], subjects: ["ECS", "STA", "MAT"] },
  { id: "consulting-business", label: "Consulting / business", keywords: ["strategy", "economics", "business", "management"], subjects: ["ECN", "MGT", "ARE"] },
  { id: "pre-health", label: "Pre-health", keywords: ["health", "biology", "physiology", "medicine"], subjects: ["BIS", "NPB", "CHE", "NUT"] },
  { id: "law-policy", label: "Law / policy", keywords: ["law", "policy", "ethics", "justice"], subjects: ["POL", "PHI", "SOC"] },
  { id: "research-grad", label: "Research / grad school", keywords: ["research", "methods", "seminar", "theory"], subjects: ["STA", "PSC", "SOC", "BIS"] },
  { id: "education", label: "Education", keywords: ["education", "learning", "development", "teaching"], subjects: ["EDU", "HDE", "PSC"] },
  { id: "environment", label: "Environment", keywords: ["environment", "climate", "ecology", "resource"], subjects: ["ESP", "EVE", "HYD"] },
  { id: "product-design", label: "Product / design", keywords: ["design", "product", "user", "media"], subjects: ["DES", "CMN", "ECS"] },
  { id: "finance-economics", label: "Finance / economics", keywords: ["finance", "economics", "market", "statistics"], subjects: ["ECN", "STA", "ARE"] },
  { id: "public-service", label: "Public service", keywords: ["public", "community", "policy", "equity"], subjects: ["POL", "SOC", "CHI"] },
];

const SKILL_OPTIONS: PersonalOption[] = [
  { id: "quant", label: "Quantitative reasoning", keywords: ["statistics", "quantitative", "calculus", "model"], subjects: ["STA", "MAT"], ge: ["QL"] },
  { id: "writing", label: "Writing", keywords: ["writing", "composition", "rhetoric"], subjects: ["UWP", "ENL"], ge: ["WE"] },
  { id: "speaking", label: "Speaking", keywords: ["communication", "public speaking", "argument"], subjects: ["CMN", "UWP"] },
  { id: "research", label: "Research", keywords: ["research", "methods", "analysis"], subjects: ["STA", "SOC", "PSC"] },
  { id: "coding", label: "Coding", keywords: ["programming", "computing", "software"], subjects: ["ECS"] },
  { id: "ethics", label: "Ethics", keywords: ["ethics", "justice", "values"], subjects: ["PHI", "POL"] },
  { id: "lab", label: "Lab skills", keywords: ["laboratory", "experiment", "science"], subjects: ["CHE", "BIS", "PHY"], ge: ["SE"] },
  { id: "creative", label: "Creative work", keywords: ["creative", "studio", "design", "music"], subjects: ["ART", "DES", "MUS"] },
];

const OUTCOME_OPTIONS: PersonalOption[] = [
  { id: "fulfill-ge", label: "Fulfill GE efficiently", keywords: ["introduction", "survey", "topics"], ge: ["AH", "SS", "SE", "WE", "QL"] },
  { id: "major-adjacent", label: "Explore major-adjacent fields", keywords: ["introduction", "foundations", "principles"] },
  { id: "portfolio", label: "Build a portfolio", keywords: ["project", "design", "studio", "writing"], subjects: ["DES", "ART", "UWP", "ECS"] },
  { id: "grad-prep", label: "Prepare for grad school", keywords: ["methods", "research", "theory", "seminar"] },
  { id: "career-signal", label: "Add a career signal", keywords: ["professional", "management", "data", "policy"] },
  { id: "fun-elective", label: "Find a genuinely fun elective", keywords: ["music", "film", "culture", "food", "popular"] },
];

const GE_OPTIONS = [
  { id: "AH", label: "Arts & Humanities" },
  { id: "SS", label: "Social Sciences" },
  { id: "SE", label: "Science & Engineering" },
  { id: "QL", label: "Quantitative Literacy" },
  { id: "WE", label: "Writing Experience" },
  { id: "DD", label: "Domestic Diversity" },
  { id: "ACGH", label: "American Cultures" },
  { id: "WC", label: "World Cultures" },
];

function defaultPersonalProfile(): PersonalDiscoveryProfile {
  return {
    name: "My Discovery",
    topics: [],
    careers: [],
    skills: [],
    outcomes: [],
    geGoals: [],
    workload: "balanced",
    level: "any",
    format: "any",
    customTopics: [],
  };
}

const CATEGORIES: DiscoveryCategory[] = [
  {
    id: "favorites",
    name: "Student Favorites",
    description: "Consistent student favorites with high ratings and high review volume.",
    icon: Flame,
    query: "minRating=4.2&sortBy=rating" 
  },
  {
    id: "easy-a",
    name: "GPA Boosters",
    description: "Courses with high average historical grades (B+ or better) and GE efficiency.",
    icon: TrendingUp,
    query: "minGpa=3.2&sortBy=gpa"
  },
  {
    id: "hidden-gems",
    name: "Hidden Gems",
    description: "Approachable instructors with exceptional ratings and low difficulty.",
    icon: Gem,
    query: "minRating=4.0&maxDifficulty=2.8&maxRatings=150&sortBy=rating"
  },
  {
    id: "stem-discovery",
    name: "STEM for All",
    description: "Highly rated, lower difficulty introductory STEM courses.",
    icon: Beaker,
    query: "level=Lower&ge=SE&minRating=3.5&sortBy=difficulty"
  },
  {
    id: "humanities-discovery",
    name: "Cultural Perspectives",
    description: "Broaden your worldview with top-rated diversity and culture GEs.",
    icon: Globe,
    query: "ge=ACGH,DD,WC&minRating=3.5&sortBy=rating"
  }
];

/* Map popular majors to their primary subject code(s) */
const MAJOR_SUBJECT_MAP: Record<string, string[]> = {
  "computer science": ["ECS"],
  "computer engineering": ["ECS", "EEC"],
  "electrical engineering": ["EEC", "ECS"],
  "mechanical engineering": ["EME"],
  "civil engineering": ["ECI"],
  "chemical engineering": ["ECH"],
  "biomedical engineering": ["BIM"],
  "biological engineering": ["BIM"],
  "aerospace engineering": ["EAE"],
  "mathematics": ["MAT"],
  "statistics": ["STA"],
  "physics": ["PHY"],
  "chemistry": ["CHE"],
  "biology": ["BIS"],
  "biochemistry": ["BIS", "CHE"],
  "molecular biology": ["MCB"],
  "neurobiology": ["NPB"],
  "psychology": ["PSC"],
  "economics": ["ECN"],
  "political science": ["POL"],
  "english": ["ENL"],
  "history": ["HIS"],
  "sociology": ["SOC"],
  "communications": ["CMN"],
  "design": ["DES"],
  "animal science": ["ANS"],
  "environmental science": ["ESP"],
  "linguistics": ["LIN"],
  "philosophy": ["PHI"],
  "music": ["MUS"],
  "art": ["ART"],
};

function getMajorSubjects(major: string): string[] {
  const lower = major.toLowerCase().replace(/,\s*(b\.\w+|m\.\w+|ph\.d\.)\.?$/i, "").trim();
  for (const [key, subjects] of Object.entries(MAJOR_SUBJECT_MAP)) {
    if (lower.includes(key)) return subjects;
  }
  // Fallback: try to extract a 2-4 letter prefix from the major name
  const words = lower.split(/\s+/);
  if (words.length > 0) {
    const prefix = words[0].slice(0, 3).toUpperCase();
    return [prefix];
  }
  return [];
}

function buildCategories(major: string, majorCategoryName = "For Your Major"): DiscoveryCategory[] {
  const subjects = getMajorSubjects(major);
  const shortMajor = major.replace(/,\s*(B\.\w+|M\.\w+|Ph\.D\.)\.?$/i, "").trim();
  if (subjects.length === 0) return CATEGORIES;
  const subjectQuery = subjects.map(s => `subject=${s}`).join("&");
  return [
    {
      id: "for-your-major",
      name: majorCategoryName,
      description: `Top-rated ${shortMajor} courses you haven't taken yet.`,
      icon: GraduationCap,
      query: `${subjectQuery}&sortBy=rating`
    },
    ...CATEGORIES
  ];
}

function optionsByIds(options: PersonalOption[], ids: string[]) {
  const selected = new Set(ids);
  return options.filter((option) => selected.has(option.id));
}

function personalSignals(profile: PersonalDiscoveryProfile) {
  const options = [
    ...optionsByIds(TOPIC_OPTIONS, profile.topics),
    ...optionsByIds(CAREER_OPTIONS, profile.careers),
    ...optionsByIds(SKILL_OPTIONS, profile.skills),
    ...optionsByIds(OUTCOME_OPTIONS, profile.outcomes),
  ];
  const keywords = new Set<string>();
  const subjects = new Set<string>();
  const ge = new Set<string>(profile.geGoals);

  for (const option of options) {
    option.keywords.forEach((keyword) => keywords.add(keyword.toLowerCase()));
    option.subjects?.forEach((subject) => subjects.add(subject.toUpperCase()));
    option.ge?.forEach((area) => ge.add(area.toUpperCase()));
  }
  profile.customTopics.forEach((topic) => keywords.add(topic.toLowerCase()));

  return {
    keywords: [...keywords],
    subjects: [...subjects],
    ge: [...ge],
  };
}

function personalDescription(profile: PersonalDiscoveryProfile) {
  const topicLabels = optionsByIds(TOPIC_OPTIONS, profile.topics)
    .slice(0, 2)
    .map((option) => option.label);
  const careerLabels = optionsByIds(CAREER_OPTIONS, profile.careers)
    .slice(0, 1)
    .map((option) => option.label);
  const labels = [...topicLabels, ...careerLabels, ...profile.customTopics.slice(0, 1)];
  if (labels.length === 0) {
    return "A personalized course tab built from your topics, career goals, skills, and preferred workload.";
  }
  return `Personalized around ${labels.join(", ")}.`;
}

function hasPersonalSignals(profile: PersonalDiscoveryProfile) {
  return (
    profile.topics.length > 0 ||
    profile.careers.length > 0 ||
    profile.skills.length > 0 ||
    profile.outcomes.length > 0 ||
    profile.geGoals.length > 0 ||
    profile.customTopics.length > 0
  );
}

function buildPersonalQueries(profile: PersonalDiscoveryProfile): string[] {
  const signals = personalSignals(profile);
  const queries = new Set<string>();
  const levelParam =
    profile.level === "lower"
      ? "&level=Lower"
      : profile.level === "upper"
        ? "&level=Upper"
        : "";

  queries.add(`open=true&limit=200&sortBy=rating${levelParam}`);

  if (signals.subjects.length > 0) {
    queries.add(
      `${signals.subjects.map((subject) => `subject=${encodeURIComponent(subject)}`).join("&")}&open=true&limit=160&sortBy=rating${levelParam}`
    );
  }

  if (signals.ge.length > 0) {
    queries.add(`ge=${encodeURIComponent(signals.ge.join(","))}&open=true&limit=160&sortBy=geCount${levelParam}`);
  }

  const searchTerms = signals.keywords
    .filter((keyword) => keyword.length >= 4)
    .slice(0, 10);
  for (const keyword of searchTerms) {
    queries.add(`q=${encodeURIComponent(keyword)}&open=true&limit=80&sortBy=rating${levelParam}`);
  }

  if (profile.workload === "lighter") {
    queries.add(`minGpa=3.2&maxDifficulty=3.0&open=true&limit=160&sortBy=gpa${levelParam}`);
  } else if (profile.workload === "challenge") {
    queries.add(`level=Upper&open=true&limit=160&sortBy=rating`);
  }

  return [...queries];
}

function sectionLevel(section: Section) {
  const match = section.courseNumber.match(/^(\d+)/);
  if (!match) return "any";
  const num = parseInt(match[1], 10);
  if (num >= 100 && num <= 199) return "upper";
  if (num >= 1 && num <= 99) return "lower";
  return "grad";
}

function scorePersonalSection(
  section: Section,
  profile: PersonalDiscoveryProfile,
  signals = personalSignals(profile)
) {
  const text = `${section.courseCode} ${section.title} ${section.subject}`.toLowerCase();
  const courseGe = new Set((section.geAreas || []).map((ge) => ge.toUpperCase()));
  const rmp = section.rmp?.[Object.keys(section.rmp)[0]];
  const avgRating = rmp?.avgRating || 0;
  const avgGpa = rmp?.grades?.avgGpa || 0;
  let score = 0;

  for (const keyword of signals.keywords) {
    if (text.includes(keyword)) score += 7;
  }
  if (signals.subjects.includes(section.subject.toUpperCase())) score += 8;
  for (const area of signals.ge) {
    if (courseGe.has(area)) score += 4;
  }

  if (profile.level !== "any" && sectionLevel(section) === profile.level) score += 3;
  if (profile.format !== "any" && section.modality === profile.format) score += 3;

  if (profile.workload === "lighter") {
    if (avgGpa >= 3.3) score += 4;
    if ((rmp?.avgDifficulty || 5) <= 3) score += 4;
    if (sectionLevel(section) === "lower") score += 1.5;
  } else if (profile.workload === "challenge") {
    if (sectionLevel(section) === "upper") score += 4;
    if (text.includes("research") || text.includes("methods") || text.includes("project")) score += 3;
  } else {
    if (avgRating >= 4) score += 2;
    if (avgGpa >= 3) score += 1;
  }

  if (avgRating) score += Math.min(5, avgRating);
  if (avgGpa) score += avgGpa;
  if (rmp?.numRatings) score += Math.min(3, Math.log10(rmp.numRatings + 1));
  if (courseGe.size > 0 && profile.outcomes.includes("fulfill-ge")) score += Math.min(4, courseGe.size);

  return score;
}

interface DiscoveryHubProps {
  studentContext: StudentContext;
  onRequestAIMinimize?: () => void;
}

export function DiscoveryHub({
  studentContext,
  onRequestAIMinimize,
}: DiscoveryHubProps) {
  const [personalProfile, setPersonalProfile] = useState<PersonalDiscoveryProfile | null>(null);
  const [personalModalOpen, setPersonalModalOpen] = useState(false);
  const advisingGoalIds = studentContext.advisingGoals?.length
    ? studentContext.advisingGoals
    : studentContext.advisingGoal
      ? [studentContext.advisingGoal]
      : [];
  const isChangeMajorGoal = advisingGoalIds.includes("change-major");
  const discoveryMajor =
    isChangeMajorGoal && studentContext.targetMajor
      ? studentContext.targetMajor
      : studentContext.major;
  const majorCategoryName =
    isChangeMajorGoal && studentContext.targetMajor
      ? "For Goal Major"
      : "For Your Major";
  const categories = useMemo(
    () => {
      const base = buildCategories(discoveryMajor, majorCategoryName);
      if (!personalProfile) return base;
      return [
        {
          id: PERSONAL_CATEGORY_ID,
          name: personalProfile.name || "My Discovery",
          description: personalDescription(personalProfile),
          icon: Brain,
          query: "",
          kind: "personal" as const,
        },
        ...base,
      ];
    },
    [discoveryMajor, majorCategoryName, personalProfile]
  );
  const [activeCategoryId, setActiveCategoryId] = useState(categories[0].id);
  const [loading, setLoading] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [displayCount, setDisplayCount] = useState(12);
  const [error, setError] = useState("");
  const [detailSection, setDetailSection] = useState<Section | null>(null);
  const [pickerData, setPickerData] = useState<{ courseCode: string; courseTitle: string; sections: Section[] } | null>(null);

  const activeCategory = categories.find(c => c.id === activeCategoryId) || categories[0];

  const openPersonalBuilder = () => {
    onRequestAIMinimize?.();
    setPersonalModalOpen(true);
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PERSONAL_DISCOVERY_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as PersonalDiscoveryProfile;
      setPersonalProfile({ ...defaultPersonalProfile(), ...saved });
    } catch {
      // Ignore corrupt local preferences.
    }
  }, []);

  const handleSavePersonalProfile = (profile: PersonalDiscoveryProfile) => {
    const next = {
      ...profile,
      name: profile.name.trim() || "My Discovery",
      customTopics: profile.customTopics.map((topic) => topic.trim()).filter(Boolean),
    };
    setPersonalProfile(next);
    window.localStorage.setItem(PERSONAL_DISCOVERY_STORAGE_KEY, JSON.stringify(next));
    setPersonalModalOpen(false);
    setActiveCategoryId(PERSONAL_CATEGORY_ID);
  };

  const handleDeletePersonalProfile = () => {
    setPersonalProfile(null);
    window.localStorage.removeItem(PERSONAL_DISCOVERY_STORAGE_KEY);
    setPersonalModalOpen(false);
    setActiveCategoryId(categories.find((category) => category.id !== PERSONAL_CATEGORY_ID)?.id || "favorites");
  };

  useEffect(() => {
    if (!categories.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId(categories[0].id);
    }
  }, [activeCategoryId, categories]);

  useEffect(() => {
    const fetchDiscovery = async (isRetry = false) => {
      setLoading(true);
      setError("");
      setDisplayCount(12); // Reset display count on category/profile change
      try {
        // Fetch program info for prerequisites
        let infoMap: Record<string, CourseMinimal> = {};
        if (discoveryMajor.trim()) {
          const progRes = await fetch(`/api/data/program?name=${encodeURIComponent(discoveryMajor)}`);
          if (progRes.ok) {
            const progData = await progRes.json();
            infoMap = progData.ge?.courseInfoMap || {};
          }
        }

        const planned = getStoredPlannedSections();
        const blocked = getStoredBlockedTimes();

        if (activeCategory.kind === "personal" && personalProfile) {
          const queryResults = await Promise.all(
            buildPersonalQueries(personalProfile).map(async (query) => {
              const res = await fetch(`/api/sections?${query}`);
              if (!res.ok) return [];
              const data = await res.json();
              return (data.sections || []) as Section[];
            })
          );
          const byCrn = new Map<string, Section>();
          for (const result of queryResults) {
            for (const section of result) byCrn.set(section.crn, section);
          }

          const signals = personalSignals(personalProfile);
          const filteredPersonal = [...byCrn.values()]
            .filter((s) => {
              if (!isEligible(s.courseCode, studentContext.completedCourses, infoMap, studentContext.year)) return false;
              if (studentContext.completedCourses.includes(s.courseCode)) return false;
              if (checkTimeConflict(s, planned, blocked)) return false;
              if (personalProfile.format !== "any" && s.modality !== personalProfile.format) return false;
              return true;
            })
            .map((section) => ({
              section,
              score: scorePersonalSection(section, personalProfile, signals),
            }))
            .filter((item) => item.score > 0 || byCrn.size < 40)
            .sort((a, b) => b.score - a.score)
            .map((item) => item.section);

          const uniquePersonal: Section[] = [];
          const seenPersonalCourses = new Set<string>();
          const instructorCounts: Record<string, number> = {};
          for (const section of filteredPersonal) {
            const instructor = section.instructors[0] || "Unknown";
            const count = instructorCounts[instructor] || 0;
            if (!seenPersonalCourses.has(section.courseCode) && count < 2) {
              seenPersonalCourses.add(section.courseCode);
              instructorCounts[instructor] = count + 1;
              uniquePersonal.push(section);
            }
          }

          setSections(uniquePersonal);
          return;
        }

        // Fetch sections based on category query
        const res = await fetch(`/api/sections?${activeCategory.query}&limit=100&open=true`);
        if (!res.ok) throw new Error("Failed to load discovery data");
        const data = await res.json();
        const allSections: Section[] = data.sections || [];

        // Filter for eligibility and schedule conflicts
        const filtered = allSections.filter(s => {
          if (!isEligible(s.courseCode, studentContext.completedCourses, infoMap, studentContext.year)) return false;
          if (checkTimeConflict(s, planned, blocked)) return false;
          // For "For Your Major" — filter out completed courses
          if (activeCategory.id === "for-your-major" && studentContext.completedCourses.includes(s.courseCode)) return false;
          return true;
        });

        // Deduplicate by courseCode AND instructor to show variety
        const uniqueByCourse: Section[] = [];
        const seenCourses = new Set<string>();
        const instructorCounts: Record<string, number> = {};

        for (const s of filtered) {
          const instructor = s.instructors[0] || "Unknown";
          const currentCount = instructorCounts[instructor] || 0;

          // Max 2 courses per instructor to ensure variety
          if (!seenCourses.has(s.courseCode) && currentCount < 2) {
            seenCourses.add(s.courseCode);
            instructorCounts[instructor] = currentCount + 1;
            uniqueByCourse.push(s);
          }
        }

        // Prioritize standard classes over internships/research/seminars
        // (Except for Hidden Gems which might specifically surface interesting small sections)
        if (activeCategory.id !== "hidden-gems") {
          uniqueByCourse.sort((a, b) => {
            const getPriority = (s: Section) => {
              const title = s.title.toUpperCase();
              const code = s.courseCode.toUpperCase();
              const numMatch = code.match(/\d+/);
              const num = numMatch ? parseInt(numMatch[0]) : 0;

              // Specialized types: 92/192 (Internship), 99/199/299 (Research/Special Study)
              const isSpecializedNum = [92, 192, 99, 199, 298, 299].includes(num);
              const isSpecializedTitle = 
                title.includes("RESEARCH") || 
                title.includes("INTERNSHIP") || 
                title.includes("SEMINAR") || 
                title.includes("SPECIAL STUDY") || 
                title.includes("DIRECTED GROUP");

              return (isSpecializedNum || isSpecializedTitle) ? 1 : 0;
            };
            return getPriority(a) - getPriority(b);
          });
        }

        // Clever fallback for Hidden Gems
        if (uniqueByCourse.length === 0 && activeCategory.id === "hidden-gems" && !isRetry) {
          console.log("Broadening Hidden Gems search...");
          // Relax constraints further
          const broaderQuery = "minRating=4.0&maxDifficulty=3.0&maxRatings=150&sortBy=rating";
          const res2 = await fetch(`/api/sections?${broaderQuery}&limit=100&open=true`);
          if (res2.ok) {
            const data2 = await res2.json();
            const allSections2: Section[] = data2.sections || [];
            const filtered2 = allSections2.filter(s => {
              if (!isEligible(s.courseCode, studentContext.completedCourses, infoMap, studentContext.year)) return false;
              if (checkTimeConflict(s, planned, blocked)) return false;
              return true;
            });
            const unique2: Section[] = [];
            for (const s of filtered2) {
              if (!seenCourses.has(s.courseCode)) {
                seenCourses.add(s.courseCode);
                unique2.push(s);
              }
            }
            setSections(unique2.slice(0, 12));
            return;
          }
        }

        setSections(uniqueByCourse);
      } catch {
        setError("Error loading discovery recommendations.");
      } finally {
        setLoading(false);
      }
    };

    fetchDiscovery();
  }, [activeCategory.id, activeCategoryId, activeCategory.kind, activeCategory.query, discoveryMajor, personalProfile, studentContext.completedCourses, studentContext.year]);

  return (
    <div className="flex h-full flex-col bg-gray-50/50 dark:bg-slate-900/50">
      <div className="border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#002855] dark:text-blue-400 flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> Discovery Hub
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              Explore course recommendations that fit your schedule and interests.
            </p>
            <p className="mt-2 max-w-2xl text-[11px] leading-5 text-gray-500 dark:text-slate-500">
              {DISCOVERY_HUB_NOTICE}
            </p>
          </div>
          <button
            type="button"
            onClick={openPersonalBuilder}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-[#002855]/15 bg-[#002855] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#001a3a] hover:shadow-md dark:border-[#DAAA00]/30 dark:bg-[#DAAA00] dark:text-[#002855]"
          >
            {personalProfile ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {personalProfile ? "Edit Personal Tab" : "Create Personal Tab"}
          </button>
        </div>

        {/* Category Tabs */}
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategoryId(cat.id)}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                activeCategoryId === cat.id
                  ? "bg-[#002855] text-white shadow-md shadow-blue-900/20"
                  : "bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700"
              }`}
            >
              <cat.icon className="h-4 w-4" />
              {cat.name}
            </button>
          ))}
          {!personalProfile && (
            <button
              type="button"
              onClick={openPersonalBuilder}
              className="flex shrink-0 items-center gap-2 rounded-full border border-dashed border-[#002855]/30 bg-[#002855]/5 px-4 py-2 text-sm font-bold text-[#002855] transition-all hover:border-[#002855]/50 hover:bg-[#002855]/10 dark:border-[#DAAA00]/40 dark:bg-[#DAAA00]/10 dark:text-[#DAAA00]"
            >
              <Plus className="h-4 w-4" />
              Personal
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">
            {activeCategory.name}
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">
            {activeCategory.description}
          </p>
          {activeCategory.kind === "personal" && personalProfile && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {[
                ...optionsByIds(TOPIC_OPTIONS, personalProfile.topics).map((option) => option.label),
                ...optionsByIds(CAREER_OPTIONS, personalProfile.careers).map((option) => option.label),
                ...personalProfile.customTopics,
              ].slice(0, 6).map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-[#002855]/8 px-2.5 py-1 text-[10px] font-bold text-[#002855] dark:bg-[#DAAA00]/15 dark:text-[#DAAA00]"
                >
                  {label}
                </span>
              ))}
              <button
                type="button"
                onClick={openPersonalBuilder}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-bold text-gray-500 transition-colors hover:border-[#002855]/30 hover:text-[#002855] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <SlidersHorizontal className="h-3 w-3" />
                Tune
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-40 animate-pulse rounded-xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-800" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        ) : sections.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-gray-300 dark:border-slate-700">
            <p className="text-sm text-gray-500 dark:text-slate-400 font-medium">No {activeCategory.name.toLowerCase()} found for your schedule.</p>
            <p className="text-xs text-gray-400 mt-1">Try clearing some time blocks or checking other categories.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sections.slice(0, displayCount).map((s, idx) => (
                <div
                  key={s.crn}
                  className="animate-[fadeSlideIn_0.4s_ease_both]"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <DiscoveryCard
                    section={s}
                    onClick={() => setDetailSection(s)}
                    onOpenPicker={(code, title, allSections) => setPickerData({ courseCode: code, courseTitle: title, sections: allSections })}
                  />
                </div>
              ))}
            </div>

            {sections.length > displayCount && displayCount < 96 && (
              <div className="mt-12 flex justify-center">
                <button
                  onClick={() => setDisplayCount(prev => Math.min(prev + 12, 96))}
                  className="rounded-full bg-white dark:bg-slate-800 px-8 py-3 text-sm font-bold text-[#002855] dark:text-blue-400 border border-gray-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:bg-gray-50 dark:hover:bg-slate-700 transition-all active:scale-95"
                >
                  Load More Classes
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {detailSection && (
        <CourseDetailModal
          section={detailSection}
          onClose={() => setDetailSection(null)}
        />
      )}

      {pickerData && (
        <SectionPickerModal
          courseCode={pickerData.courseCode}
          courseTitle={pickerData.courseTitle}
          sections={pickerData.sections}
          onClose={() => setPickerData(null)}
        />
      )}

      {personalModalOpen && (
        <PersonalDiscoveryModal
          profile={personalProfile || defaultPersonalProfile()}
          onClose={() => setPersonalModalOpen(false)}
          onSave={handleSavePersonalProfile}
          onDelete={personalProfile ? handleDeletePersonalProfile : undefined}
        />
      )}
    </div>
  );
}

function PersonalDiscoveryModal({
  profile,
  onClose,
  onSave,
  onDelete,
}: {
  profile: PersonalDiscoveryProfile;
  onClose: () => void;
  onSave: (profile: PersonalDiscoveryProfile) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<PersonalDiscoveryProfile>(profile);
  const [customInput, setCustomInput] = useState("");
  const canSave = hasPersonalSignals(draft);

  const toggle = (field: "topics" | "careers" | "skills" | "outcomes" | "geGoals", value: string) => {
    setDraft((prev) => {
      const selected = prev[field].includes(value);
      return {
        ...prev,
        [field]: selected
          ? prev[field].filter((item) => item !== value)
          : [...prev[field], value],
      };
    });
  };

  const addCustomTopic = () => {
    const next = customInput.trim();
    if (!next || draft.customTopics.includes(next)) return;
    setDraft((prev) => ({ ...prev, customTopics: [...prev.customTopics, next] }));
    setCustomInput("");
  };

  const removeCustomTopic = (topic: string) => {
    setDraft((prev) => ({
      ...prev,
      customTopics: prev.customTopics.filter((item) => item !== topic),
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#DAAA00]">
              Discovery Builder
            </p>
            <h3 className="mt-1 text-lg font-bold text-[#002855] dark:text-white">
              Create a personal discovery tab
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Tell Adviso what you care about, then it will rank courses around your interests, career direction, skills, GE needs, workload, and format.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close personal discovery builder"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="space-y-6">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-slate-500">
                Tab name
              </label>
              <input
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-900 outline-none transition-all focus:border-[#002855] focus:bg-white focus:ring-2 focus:ring-[#002855]/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#DAAA00]"
                placeholder="My Discovery"
              />
            </div>

            <OptionGroup
              icon={Brain}
              title="Topics you are interested in"
              options={TOPIC_OPTIONS}
              selected={draft.topics}
              onToggle={(id) => toggle("topics", id)}
            />

            <OptionGroup
              icon={BriefcaseBusiness}
              title="Career paths you might want to explore"
              options={CAREER_OPTIONS}
              selected={draft.careers}
              onToggle={(id) => toggle("careers", id)}
            />

            <OptionGroup
              icon={Target}
              title="Skills you want to build"
              options={SKILL_OPTIONS}
              selected={draft.skills}
              onToggle={(id) => toggle("skills", id)}
            />

            <OptionGroup
              icon={Sparkles}
              title="What this tab should optimize for"
              options={OUTCOME_OPTIONS}
              selected={draft.outcomes}
              onToggle={(id) => toggle("outcomes", id)}
            />

            <div>
              <div className="mb-2 flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-[#002855] dark:text-[#DAAA00]" />
                <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-slate-400">
                  GE goals
                </h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {GE_OPTIONS.map((ge) => {
                  const selected = draft.geGoals.includes(ge.id);
                  return (
                    <button
                      key={ge.id}
                      type="button"
                      onClick={() => toggle("geGoals", ge.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${
                        selected
                          ? "border-[#002855] bg-[#002855] text-white shadow-sm dark:border-[#DAAA00] dark:bg-[#DAAA00] dark:text-[#002855]"
                          : "border-gray-200 bg-white text-gray-600 hover:border-[#002855]/30 hover:text-[#002855] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                      title={ge.label}
                    >
                      {selected && <Check className="h-3 w-3" />}
                      {ge.id}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <SelectorGroup
                title="Workload"
                value={draft.workload}
                options={[
                  { id: "balanced", label: "Balanced" },
                  { id: "lighter", label: "Lighter" },
                  { id: "challenge", label: "Challenge me" },
                ]}
                onChange={(value) =>
                  setDraft((prev) => ({
                    ...prev,
                    workload: value as PersonalDiscoveryProfile["workload"],
                  }))
                }
              />
              <SelectorGroup
                title="Course level"
                value={draft.level}
                options={[
                  { id: "any", label: "Any level" },
                  { id: "lower", label: "Intro / lower" },
                  { id: "upper", label: "Upper division" },
                ]}
                onChange={(value) =>
                  setDraft((prev) => ({
                    ...prev,
                    level: value as PersonalDiscoveryProfile["level"],
                  }))
                }
              />
              <SelectorGroup
                title="Format"
                value={draft.format}
                options={[
                  { id: "any", label: "Any format" },
                  { id: "in-person", label: "In person" },
                  { id: "online", label: "Online" },
                  { id: "hybrid", label: "Hybrid" },
                ]}
                onChange={(value) =>
                  setDraft((prev) => ({
                    ...prev,
                    format: value as PersonalDiscoveryProfile["format"],
                  }))
                }
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-slate-400">
                Add your own topics
              </label>
              <div className="flex gap-2">
                <input
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomTopic();
                    }
                  }}
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition-all focus:border-[#002855] focus:bg-white focus:ring-2 focus:ring-[#002855]/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="e.g. food systems, sports analytics, urban design"
                />
                <button
                  type="button"
                  onClick={addCustomTopic}
                  className="rounded-xl bg-[#002855] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#001a3a] dark:bg-[#DAAA00] dark:text-[#002855]"
                >
                  Add
                </button>
              </div>
              {draft.customTopics.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {draft.customTopics.map((topic) => (
                    <span
                      key={topic}
                      className="inline-flex items-center gap-1 rounded-full bg-[#002855]/10 px-3 py-1.5 text-xs font-bold text-[#002855] dark:bg-[#DAAA00]/15 dark:text-[#DAAA00]"
                    >
                      {topic}
                      <button
                        type="button"
                        onClick={() => removeCustomTopic(topic)}
                        aria-label={`Remove ${topic}`}
                        className="text-[#002855]/50 hover:text-[#002855] dark:text-[#DAAA00]/60 dark:hover:text-[#DAAA00]"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {!canSave && (
              <p className="text-xs font-medium text-gray-400 dark:text-slate-500">
                Pick at least one topic, career, skill, outcome, GE, or custom topic.
              </p>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-red-500 transition-colors hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove personal tab
              </button>
            )}
          </div>
          <div className="flex gap-2 sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave(draft)}
              disabled={!canSave}
              className="rounded-xl bg-[#002855] px-5 py-2 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#001a3a] hover:shadow-md disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none dark:bg-[#DAAA00] dark:text-[#002855] dark:hover:bg-[#c99c00]"
            >
              Create Tab
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OptionGroup({
  icon: Icon,
  title,
  options,
  selected,
  onToggle,
}: {
  icon: LucideIcon;
  title: string;
  options: PersonalOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#002855] dark:text-[#DAAA00]" />
        <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-slate-400">
          {title}
        </h4>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onToggle(option.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${
                isSelected
                  ? "border-[#002855] bg-[#002855] text-white shadow-sm dark:border-[#DAAA00] dark:bg-[#DAAA00] dark:text-[#002855]"
                  : "border-gray-200 bg-white text-gray-600 hover:border-[#002855]/30 hover:text-[#002855] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {isSelected && <Check className="h-3 w-3" />}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SelectorGroup({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-slate-400">
        {title}
      </p>
      <div className="space-y-1.5">
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs font-bold transition-all ${
                selected
                  ? "border-[#002855] bg-[#002855]/5 text-[#002855] ring-1 ring-[#DAAA00]/60 dark:border-[#DAAA00] dark:bg-[#DAAA00]/10 dark:text-[#DAAA00]"
                  : "border-gray-200 bg-white text-gray-600 hover:border-[#002855]/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {option.label}
              {selected && <Check className="h-3.5 w-3.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DiscoveryCard({ section, onClick, onOpenPicker }: { section: Section; onClick: () => void; onOpenPicker: (code: string, title: string, sections: Section[]) => void }) {
  const [isAdded, setIsAdded] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const rmp = section.rmp?.[Object.keys(section.rmp)[0]];

  const handleAdd = async () => {
    if (isChecking || isAdded) return;
    setIsChecking(true);
    
    try {
      const res = await fetch(`/api/sections?q=${encodeURIComponent(section.courseCode)}&open=true`);
      const data = await res.json();
      const allSections = data.sections || [];
      
      if (allSections.length > 1) {
        // Multiple options — open dedicated picker
        onOpenPicker(section.courseCode, section.title, allSections);
      } else {
        // Only one option — add immediately
        dispatchScheduleAdd(section);
        setIsAdded(true);
        setTimeout(() => setIsAdded(false), 2000);
      }
    } catch {
      // Fallback: add current section if fetch fails
      dispatchScheduleAdd(section);
      setIsAdded(true);
      setTimeout(() => setIsAdded(false), 2000);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div
      onClick={onClick}
      className={`group relative flex cursor-pointer flex-col rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-800 p-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:border-[#002855] dark:hover:border-blue-500/50 ${isAdded ? 'scale-[1.02] border-green-500/50 dark:border-green-500/50 shadow-green-500/10' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-gray-900 dark:text-white group-hover:text-[#002855] dark:group-hover:text-blue-400 transition-colors">
              {section.courseCode}
            </h4>
            {rmp && rmp.avgRating >= 4.8 && (
              <span className="rounded-full bg-amber-500/10 dark:bg-amber-400/10 px-2 py-0.5 text-[8px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider border border-amber-500/20 dark:border-amber-400/20 shadow-sm shadow-amber-500/5">
                Top Rated
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-gray-500 dark:text-slate-400 line-clamp-1">
            {section.title}
          </p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 dark:bg-slate-700/50 text-[#002855] dark:text-blue-400">
          <span className="text-xs font-bold">{section.units}</span>
        </div>
      </div>

      <div className="mt-4 flex-1">
        <div className="flex items-center gap-3 text-[10px] text-gray-500 dark:text-slate-400">
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            {section.meetings[0]?.days.join("")} {section.meetings[0]?.startTime}
          </div>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
            {section.modality}
          </div>
        </div>

        {rmp && (
          <div className="mt-3 flex items-center gap-4 border-t border-gray-50 dark:border-slate-700/50 pt-3">
            <div className="flex flex-col">
              <span className="text-[9px] text-gray-400 dark:text-slate-500 uppercase tracking-wide font-bold">Instructor</span>
              <span className="text-[10px] font-semibold text-gray-700 dark:text-slate-300 truncate w-24">{section.instructors[0] || "The Faculty"}</span>
            </div>
            {rmp && section.instructors[0] !== "The Faculty" && (
              <div className="flex flex-col">
                <span className="text-[9px] text-gray-400 dark:text-slate-500 uppercase tracking-wide font-bold">Rating</span>
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] font-bold ${rmp.avgRating >= 4 ? 'text-green-600 dark:text-green-400' : 'text-amber-600'}`}>{rmp.avgRating}</span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className={`h-1 w-1 rounded-full ${i <= Math.round(rmp.avgRating) ? 'bg-amber-400' : 'bg-gray-200 dark:bg-slate-700'}`} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {rmp?.grades?.avgGpa && section.instructors[0] !== "The Faculty" && (
              <div className="flex flex-col">
                <span className="text-[9px] text-gray-400 dark:text-slate-500 uppercase tracking-wide font-bold">Avg. Grade</span>
                <GPABadge gpa={rmp.grades.avgGpa} className="mt-0.5" />
              </div>
            )}
          </div>
        )}
      </div>

      <button 
        onClick={(e) => { e.stopPropagation(); handleAdd(); }}
        disabled={isAdded}
        className={`mt-4 w-full rounded-xl py-2.5 text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 ${
          isAdded 
            ? "bg-green-500 text-white" 
            : "bg-gray-50 dark:bg-slate-700/50 text-[#002855] dark:text-blue-300 hover:bg-[#002855] dark:hover:bg-blue-600 hover:text-white"
        }`}
      >
        {isAdded ? (
          <>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Added to Schedule!
          </>
        ) : (
          "Add to Schedule +"
        )}
      </button>
    </div>
  );
}
