import type { RequirementSection } from "./course-data";
import { normalizeCourseCode } from "./course-code";

export interface NormalizedRequirementItem {
  id: string;
  label: string;
  courses: string[];
  requiredCount: number;
  kind: "course" | "choice" | "series";
  options?: string[][];
}

export interface NormalizedRequirementSection {
  heading: string;
  notes: string[];
  units: string;
  items: NormalizedRequirementItem[];
  informational?: boolean;
}

interface ParsedRequirementOption {
  courses: string[];
  isSeries: boolean;
  isCrosslisted: boolean;
  isOr: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function compactCode(code: string): string {
  return normalizeCourseCode(code.toUpperCase().replace(/\s+/g, " ").trim().replace(/^OR\s+/, ""));
}

function splitRepeatedSubjectCourses(raw: string): string[] {
  const cleaned = compactCode(raw);
  const subjectMatch = cleaned.match(/^([A-Z]{2,4})\s+(.+)$/);
  const withBreaks = subjectMatch
    ? cleaned.replace(
        new RegExp(`(\\d{3}[A-Z]{0,2})(?=${subjectMatch[1]}\\s+\\d{3})`, "g"),
        "$1|"
      )
    : cleaned;
  const pieces = withBreaks.split("|").map((piece) => piece.trim()).filter(Boolean);
  return pieces.flatMap((piece) => {
    const match = piece.match(/^([A-Z]{2,4})\s+(.+)$/);
    if (!match) return [piece];
    const [, subject, rest] = match;
    const numbers = rest.match(/\d{3}[A-Z]{0,2}/g);
    if (numbers && numbers.join("") === rest) {
      return numbers.map((number) => `${subject} ${number}`);
    }
    return [piece];
  });
}

function expandCrosslistedCourse(raw: string): string[] {
  const cleaned = compactCode(raw);
  const sharedNumber = cleaned.match(/^([A-Z]{2,4}(?:\/[A-Z]{2,4})+)\s+(\d{3}[A-Z]{0,2})$/);
  if (sharedNumber) {
    return sharedNumber[1].split("/").map((subject) => `${subject} ${sharedNumber[2]}`);
  }

  if (!cleaned.includes("/")) return [cleaned];

  const expanded = cleaned
    .split("/")
    .map((piece) => piece.trim())
    .filter((piece) => /^[A-Z]{2,4}\s+\d{3}[A-Z]{0,2}$/.test(piece));

  return expanded.length > 1 ? expanded : [cleaned];
}

function parseCourseEntry(raw: string) {
  const isOr = /^\s*or\b/i.test(raw);
  const repeated = splitRepeatedSubjectCourses(raw);
  if (repeated.length > 1) {
    return {
      courses: repeated.flatMap(expandCrosslistedCourse),
      isSeries: true,
      isCrosslisted: false,
      isOr,
    };
  }

  const courses = expandCrosslistedCourse(raw);
  return {
    courses,
    isSeries: false,
    isCrosslisted: courses.length > 1,
    isOr,
  };
}

function variantBase(code: string): string {
  const normalized = compactCode(code);
  const match = normalized.match(/^([A-Z]{2,4})\s+(\d{3})([A-Z]{0,2})$/);
  if (!match) return normalized;
  const [, subject, number, suffix] = match;
  if ((suffix.endsWith("V") || suffix.endsWith("Y")) && suffix.length <= 2) {
    return `${subject} ${number}${suffix.slice(0, -1)}`;
  }
  return normalized;
}

function choicePhraseCount(text: string): number {
  const matches = Array.from(
    text.matchAll(
      /\b(?:choose|select|take)\s+(?:any\s+)?(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)(?:\s*(?:-|to)\s*(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+))?/gi
    )
  );
  return matches.filter((match) => {
    const after = text.slice((match.index ?? 0) + match[0].length);
    const nextChar = text[(match.index ?? 0) + match[0].length] ?? " ";
    return /[\s:;,-]/.test(nextChar) && !/^\s+(?:units?|minimum|maximum)\b/i.test(after);
  }).length;
}

function choiceInstructionCount(text: string): number {
  return (text.match(/\b(?:choose|select|take)\b/gi) || []).length;
}

function extractChoiceCount(text: string): number | null {
  const matches = text.matchAll(
    /\b(?:choose|select|take)\s+(?:any\s+)?(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)(?:\s*(?:-|to)\s*(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+))?/gi
  );
  for (const match of matches) {
    const after = text.slice((match.index ?? 0) + match[0].length);
    const nextChar = text[(match.index ?? 0) + match[0].length] ?? " ";
    if (!/[\s:;,-]/.test(nextChar) || /^\s+(?:units?|minimum|maximum)\b/i.test(after)) continue;
    const value = match[1].toLowerCase();
    const numeric = NUMBER_WORDS[value] ?? parseInt(value, 10);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function extractAreaChoiceCount(text: string): number | null {
  const match = text.match(
    /\bchoose\s+one\s+course\s+each\s+from\s+any\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+areas?\b/i
  );
  if (!match) return null;
  const value = match[1].toLowerCase();
  const numeric = NUMBER_WORDS[value] ?? parseInt(value, 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function isChooseSeries(text: string): boolean {
  return /\bchoose\s+(?:a|one)\s+series\b/i.test(text);
}

function unitRangeMax(units: string): number {
  const nums = units.match(/\d+/g)?.map(Number) ?? [];
  return nums.length ? Math.max(...nums) : 0;
}

function seriesStem(code: string): string | null {
  const match = compactCode(code).match(/^([A-Z]{2,4})\s+(\d{3})[A-Z]$/);
  return match ? `${match[1]} ${match[2]}` : null;
}

function subjectOf(code: string): string | null {
  return compactCode(code).match(/^([A-Z]{2,4})\s+/)?.[1] ?? null;
}

function samePath(a: RequirementSection, b: RequirementSection) {
  return (a.group || "") === (b.group || "");
}

function isLetteredChoiceArea(section: RequirementSection) {
  return /^\([a-z]\)\s+/i.test(section.heading || "");
}

function mergeAreaChoiceSections(sections: RequirementSection[]) {
  const merged: RequirementSection[] = [];

  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i];
    const areaChoiceCount = extractAreaChoiceCount(`${section.heading} ${(section.notes || []).join(" ")}`);
    if (areaChoiceCount && section.courses.length === 0) {
      const areaSections: RequirementSection[] = [];
      let cursor = i + 1;
      while (
        cursor < sections.length &&
        samePath(section, sections[cursor]) &&
        isLetteredChoiceArea(sections[cursor])
      ) {
        areaSections.push(sections[cursor]);
        cursor += 1;
      }

      if (areaSections.length > 0) {
        merged.push({
          ...section,
          courses: Array.from(new Set(areaSections.flatMap((area) => area.courses || []))),
          notes: section.notes || [],
        });
        i = cursor - 1;
        continue;
      }
    }

    merged.push(section);
  }

  return merged;
}

export function getRequirementPathGroups(sections: RequirementSection[]) {
  return Array.from(
    new Set(
      sections
        .map((section) => section.group)
        .filter((group): group is string => Boolean(group && group.trim()))
    )
  );
}

export function getDefaultRequirementPath(sections: RequirementSection[]) {
  const groups = getRequirementPathGroups(sections);
  return groups.find((group) => /\bgeneral\b/i.test(group)) ?? groups[0] ?? "";
}

export function filterRequirementSectionsByPath(
  sections: RequirementSection[],
  selectedPath: string
) {
  const groups = getRequirementPathGroups(sections);
  if (groups.length <= 1 || !selectedPath) return sections;
  return sections.filter((section) => !section.group || section.group === selectedPath);
}

function buildCombinationChoiceItem(
  sectionIndex: number,
  context: string,
  parsedOptions: ParsedRequirementOption[],
  options: ParsedRequirementOption[]
): NormalizedRequirementItem | null {
  if (!/\bor\s+a\s+combination\b/i.test(context)) return null;

  const orderedCourses = options.flatMap((option) => option.courses);
  const rawSingleCourses = parsedOptions
    .filter((option) => option.courses.length === 1)
    .map((option) => option.courses[0]);
  const counts = rawSingleCourses.reduce((map, course) => {
    map.set(course, (map.get(course) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  const primary =
    orderedCourses.find((course) => (counts.get(course) ?? 0) > 1) ??
    orderedCourses[0];
  const remaining = orderedCourses.filter((course) => course !== primary);
  const comboBase = remaining[0];
  const alternatives = remaining.slice(1);

  if (!primary || !comboBase || alternatives.length === 0) return null;

  const optionRows = [
    [primary],
    ...alternatives.map((alternative) => [comboBase, alternative]),
  ];

  return {
    id: `${sectionIndex}-combination`,
    label: "Choose one path",
    courses: Array.from(new Set(optionRows.flat())),
    requiredCount: 1,
    kind: "series",
    options: optionRows,
  };
}

function buildSeriesChoiceItem(
  sectionIndex: number,
  options: ParsedRequirementOption[]
): NormalizedRequirementItem | null {
  let seriesOptions = options
    .filter((option) => option.isSeries)
    .map((option) => option.courses);

  if (seriesOptions.length === 0) {
    const groups = new Map<string, string[]>();
    for (const option of options) {
      if (option.courses.length !== 1) continue;
      const course = option.courses[0];
      const stem = seriesStem(course);
      if (!stem) continue;
      groups.set(stem, [...(groups.get(stem) ?? []), course]);
    }
    seriesOptions = Array.from(groups.values()).filter((group) => group.length > 1);
  }

  if (seriesOptions.length === 0) return null;

  const seriesCourses = new Set(seriesOptions.flat());
  const singletonOptions = options
    .filter((option) => !option.isSeries && option.courses.length === 1)
    .map((option) => option.courses[0]);

  const nonSeriesSingles = singletonOptions.filter((course) => !seriesCourses.has(course));
  const optionRows =
    seriesOptions.length > 1
      ? seriesOptions
      : [...seriesOptions, ...nonSeriesSingles.map((course) => [course])];

  if (optionRows.length <= 1) return null;

  const optionLengths = optionRows.map((option) => option.length);
  const allSameLength = new Set(optionLengths).size === 1;

  return {
    id: `${sectionIndex}-series`,
    label: allSameLength ? "Choose one series" : "Choose one path",
    courses: Array.from(new Set(optionRows.flat())),
    requiredCount: allSameLength ? optionLengths[0] : 1,
    kind: "series",
    options: optionRows,
  };
}

function buildImplicitSeriesChoiceItem(
  sectionIndex: number,
  parsedOptions: ParsedRequirementOption[],
  options: ParsedRequirementOption[]
): NormalizedRequirementItem | null {
  const seriesOptions = options
    .filter((option) => option.isSeries && option.courses.length > 1)
    .map((option) => option.courses);
  if (seriesOptions.length === 0) return null;

  const rawCounts = parsedOptions.flatMap((option) => option.courses).reduce((map, course) => {
    map.set(course, (map.get(course) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
  const duplicatedSeries = seriesOptions.filter((option) =>
    option.every((course) => (rawCounts.get(course) ?? 0) > 1)
  );
  if (duplicatedSeries.length === 0) return null;

  const seriesCourses = new Set(duplicatedSeries.flat());
  const singletonChoices = options
    .filter((option) => !option.isSeries && option.courses.length === 1)
    .map((option) => option.courses[0])
    .filter((course) => !seriesCourses.has(course));
  if (singletonChoices.length === 0) return null;

  const optionRows = [
    ...duplicatedSeries,
    ...singletonChoices.map((course) => [course]),
  ];
  const optionLengths = optionRows.map((option) => option.length);
  const allSameLength = new Set(optionLengths).size === 1;

  return {
    id: `${sectionIndex}-implicit-series`,
    label: allSameLength ? "Choose one series" : "Choose one path",
    courses: Array.from(new Set(optionRows.flat())),
    requiredCount: allSameLength ? optionLengths[0] : 1,
    kind: "series",
    options: optionRows,
  };
}

function buildItemFromExplicitOrGroup(
  sectionIndex: number,
  groupIndex: number,
  group: ParsedRequirementOption[]
): NormalizedRequirementItem[] {
  if (group.length === 1) {
    const option = group[0];
    if (option.isSeries && !option.isCrosslisted) {
      return option.courses.map((course, courseIndex) => ({
        id: `${sectionIndex}-or-${groupIndex}-${courseIndex}`,
        label: course,
        courses: [course],
        requiredCount: 1,
        kind: "course",
      }));
    }

    const courses = Array.from(new Set(option.courses));
    return [
      {
        id: `${sectionIndex}-or-${groupIndex}`,
        label: courses.length > 1 ? variantBase(courses[0]) : courses[0],
        courses,
        requiredCount: 1,
        kind: courses.length > 1 ? "choice" : "course",
      },
    ];
  }

  const courses = Array.from(new Set(group.flatMap((option) => option.courses)));
  return [
    {
      id: `${sectionIndex}-or-${groupIndex}`,
      label: "Choose 1",
      courses,
      requiredCount: 1,
      kind: "choice",
    },
  ];
}

function buildItemsFromExplicitOrRows(
  sectionIndex: number,
  options: ParsedRequirementOption[]
): NormalizedRequirementItem[] | null {
  if (!options.some((option) => option.isOr)) return null;

  const groups: ParsedRequirementOption[][] = [];
  for (const option of options) {
    if (option.isOr && groups.length > 0) {
      groups[groups.length - 1].push(option);
    } else {
      groups.push([option]);
    }
  }

  return groups.flatMap((group, groupIndex) =>
    buildItemFromExplicitOrGroup(sectionIndex, groupIndex, group)
  );
}

function itemProgress(item: NormalizedRequirementItem, completed: Set<string>) {
  if (item.kind === "series" && item.options?.length) {
    const optionLengths = item.options.map((option) => option.length);
    const variableLengthOptions = new Set(optionLengths).size > 1;
    if (item.requiredCount === 1 && variableLengthOptions) {
      return item.options.some((option) => option.every((code) => completed.has(code))) ? 1 : 0;
    }

    const best = Math.max(
      ...item.options.map((option) => option.filter((code) => completed.has(code)).length)
    );
    return Math.min(best, item.requiredCount);
  }
  const completedCount = item.courses.filter((code) => completed.has(code)).length;
  return Math.min(completedCount, item.requiredCount);
}

export function getRequirementItemProgress(
  item: NormalizedRequirementItem,
  completedCourses: string[]
) {
  return itemProgress(item, new Set(completedCourses.map(compactCode)));
}

export function getRequirementSectionProgress(
  section: NormalizedRequirementSection,
  completedCourses: string[]
) {
  const completed = new Set(completedCourses.map(compactCode));
  const total = section.items.reduce((sum, item) => sum + item.requiredCount, 0);
  const done = section.items.reduce((sum, item) => sum + itemProgress(item, completed), 0);
  return { completed: done, total };
}

export function normalizeRequirementSections(
  sections: RequirementSection[]
): NormalizedRequirementSection[] {
  return mergeAreaChoiceSections(sections)
    .map((section, sectionIndex) => {
      const context = `${section.heading} ${(section.notes || []).join(" ")}`;
      const chooseCount = extractAreaChoiceCount(context) ?? extractChoiceCount(context);
      const choosePhrases = choicePhraseCount(context);
      const chooseInstructions = choiceInstructionCount(context);
      const chooseSeries = isChooseSeries(context);
      const optionSeen = new Set<string>();
      const parsedOptions = section.courses
        .flatMap((course) => {
          const parsed = parseCourseEntry(course);
          parsed.courses = parsed.courses.map(compactCode);
          return parsed.courses.length ? [parsed] : [];
        });
      const options = parsedOptions
        .filter((option) => {
          const key = option.courses.join("|");
          if (optionSeen.has(key)) return false;
          optionSeen.add(key);
          return true;
        });

      const items: NormalizedRequirementItem[] = [];
      const combinationChoice = buildCombinationChoiceItem(
        sectionIndex,
        context,
        parsedOptions,
        options
      );

      if (combinationChoice) {
        return {
          heading: section.heading,
          notes: section.notes || [],
          units: section.units,
          items: [combinationChoice],
        };
      }

      const implicitSeriesChoice =
        chooseCount == null && !chooseSeries
          ? buildImplicitSeriesChoiceItem(sectionIndex, parsedOptions, options)
          : null;
      if (implicitSeriesChoice) {
        return {
          heading: section.heading,
          notes: section.notes || [],
          units: section.units,
          items: [implicitSeriesChoice],
        };
      }

      if (chooseSeries) {
        const seriesChoice = buildSeriesChoiceItem(sectionIndex, options);
        if (seriesChoice) {
          const consumed = new Set(seriesChoice.courses);
          const hasUnconsumedSingles = options.some((option) =>
            !option.isSeries && option.courses.some((course) => !consumed.has(course))
          );
          if (!hasUnconsumedSingles) {
            return {
              heading: section.heading,
              notes: section.notes || [],
              units: section.units,
              items: [seriesChoice],
            };
          }
          items.push(seriesChoice);
        }
      }

      const remainingOptions = chooseSeries
        ? options.filter((option) => !option.isSeries)
        : options;
      const effectiveChooseCount =
        chooseSeries && items.some((item) => item.kind === "series") ? null : chooseCount;

      const explicitOrItems =
        !chooseSeries && effectiveChooseCount == null
          ? buildItemsFromExplicitOrRows(sectionIndex, remainingOptions)
          : null;
      if (explicitOrItems) {
        items.push(...explicitOrItems);
        return {
          heading: section.heading,
          notes: section.notes || [],
          units: section.units,
          items,
        };
      }

      const baseGroups = new Map<string, string[]>();
      for (const option of remainingOptions) {
        if (option.isCrosslisted) {
          const key = option.courses.join("/");
          baseGroups.set(key, option.courses);
          continue;
        }
        if (option.isSeries) {
          for (const course of option.courses) {
            const key = variantBase(course);
            baseGroups.set(key, Array.from(new Set([...(baseGroups.get(key) ?? []), course])));
          }
          continue;
        }
        const course = option.courses[0];
        const key = variantBase(course);
        baseGroups.set(key, Array.from(new Set([...(baseGroups.get(key) ?? []), course])));
      }

      const baseItems = Array.from(baseGroups.entries()).map(([base, courses], index) => ({
        id: `${sectionIndex}-base-${index}`,
        label: courses.length > 1 ? base : courses[0],
        courses,
        requiredCount: 1,
        kind: courses.length > 1 ? "choice" as const : "course" as const,
      }));

      const headingHasOr = /\bor\b/i.test(section.heading);
      const headingHasAnd = /\band\b/i.test(section.heading);
      const restSubjects = new Set(
        baseItems.slice(1).map((item) => subjectOf(item.courses[0])).filter(Boolean)
      );
      const firstSubject = subjectOf(baseItems[0]?.courses[0] ?? "");
      const looksLikeMandatoryPlusChoice =
        headingHasAnd &&
        headingHasOr &&
        baseItems.length >= 3 &&
        restSubjects.size === 1 &&
        firstSubject != null &&
        !restSubjects.has(firstSubject);
      const looksLikeSingleCoursePool =
        headingHasOr && !headingHasAnd && baseItems.length > 1 && unitRangeMax(section.units) <= 5;
      const shouldPool =
        baseItems.length > 1 &&
        ((effectiveChooseCount != null && choosePhrases <= 1 && chooseInstructions <= 1) ||
          looksLikeSingleCoursePool);

      if (looksLikeMandatoryPlusChoice) {
        items.push(baseItems[0]);
        items.push({
          id: `${sectionIndex}-and-choice`,
          label: "Choose 1",
          courses: Array.from(new Set(baseItems.slice(1).flatMap((item) => item.courses))),
          requiredCount: 1,
          kind: "choice",
        });
      } else if (shouldPool) {
        const requiredCount = effectiveChooseCount ?? 1;
        items.push({
          id: `${sectionIndex}-choice`,
          label: `Choose ${requiredCount}`,
          courses: Array.from(new Set(baseItems.flatMap((item) => item.courses))),
          requiredCount,
          kind: "choice",
        });
      } else {
        items.push(...baseItems);
      }

      return {
        heading: section.heading,
        notes: section.notes || [],
        units: section.units,
        items,
        informational: items.length === 0,
      };
    })
    .filter((section) => section.items.length > 0 || section.notes.length > 0);
}
