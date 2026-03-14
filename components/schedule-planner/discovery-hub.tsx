
"use client";

import { useState, useEffect } from "react";
import type { Section, StudentContext } from "@/lib/course-data";
import { isEligible } from "@/lib/eligibility";
import { getStoredPlannedSections, getStoredBlockedTimes, checkTimeConflict } from "@/lib/schedule-state";
import { dispatchScheduleAdd } from "@/lib/schedule-store";
import { Sparkles, Flame, TrendingUp, Gem, Beaker, Globe, GraduationCap } from "lucide-react";
import { GPABadge } from "./gpa-display";
import { CourseDetailModal } from "./course-detail-modal";
import { SectionPickerModal } from "./section-picker-modal";

interface DiscoveryCategory {
  id: string;
  name: string;
  description: string;
  icon: any;
  query: string; // Subject or filter
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

function buildCategories(major: string): DiscoveryCategory[] {
  const subjects = getMajorSubjects(major);
  const shortMajor = major.replace(/,\s*(B\.\w+|M\.\w+|Ph\.D\.)\.?$/i, "").trim();
  if (subjects.length === 0) return CATEGORIES;
  const subjectQuery = subjects.map(s => `subject=${s}`).join("&");
  return [
    {
      id: "for-your-major",
      name: "For Your Major",
      description: `Top-rated ${shortMajor} courses you haven't taken yet.`,
      icon: GraduationCap,
      query: `${subjectQuery}&sortBy=rating`
    },
    ...CATEGORIES
  ];
}

interface DiscoveryHubProps {
  studentContext: StudentContext;
}

export function DiscoveryHub({ studentContext }: DiscoveryHubProps) {
  const categories = buildCategories(studentContext.major);
  const [activeCategoryId, setActiveCategoryId] = useState(categories[0].id);
  const [loading, setLoading] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [displayCount, setDisplayCount] = useState(12);
  const [error, setError] = useState("");
  const [detailSection, setDetailSection] = useState<Section | null>(null);
  const [pickerData, setPickerData] = useState<{ courseCode: string; courseTitle: string; sections: Section[] } | null>(null);

  const activeCategory = categories.find(c => c.id === activeCategoryId) || categories[0];

  useEffect(() => {
    const fetchDiscovery = async (isRetry = false) => {
      setLoading(true);
      setError("");
      setDisplayCount(12); // Reset display count on category/profile change
      try {
        // Fetch sections based on category query
        const res = await fetch(`/api/sections?${activeCategory.query}&limit=100&open=true`);
        if (!res.ok) throw new Error("Failed to load discovery data");
        const data = await res.json();
        const allSections: Section[] = data.sections || [];

        // Fetch program info for prerequisites
        const progRes = await fetch(`/api/data/program?name=${encodeURIComponent(studentContext.major)}`);
        const progData = await progRes.json();
        const infoMap = progData.ge?.courseInfoMap || {};

        const planned = getStoredPlannedSections();
        const blocked = getStoredBlockedTimes();

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
      } catch (e) {
        setError("Error loading discovery recommendations.");
      } finally {
        setLoading(false);
      }
    };

    fetchDiscovery();
  }, [activeCategoryId, studentContext.major, studentContext.completedCourses, studentContext.year]);

  return (
    <div className="flex h-full flex-col bg-gray-50/50 dark:bg-slate-900/50">
      <div className="border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4">
        <h2 className="text-xl font-bold text-[#002855] dark:text-blue-400 flex items-center gap-2">
          <Sparkles className="h-5 w-5" /> Discovery Hub
        </h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
          Explore course recommendations that fit your schedule and interests.
        </p>

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
    } catch (e) {
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
