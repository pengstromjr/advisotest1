import type { Section } from "./course-data";
import {
  CURRENT_INSTRUCTION_END_DATE,
  CURRENT_INSTRUCTION_START_DATE,
  CURRENT_TERM_LABEL,
  CURRENT_TERM_TIMEZONE,
} from "./current-term";

const ICS_DAY_CODES: Record<string, string> = {
  M: "MO",
  T: "TU",
  W: "WE",
  R: "TH",
  F: "FR",
};

const DAY_INDEX: Record<string, number> = {
  M: 1,
  T: 2,
  W: 3,
  R: 4,
  F: 5,
};

export interface CalendarExportResult {
  calendarText: string;
  eventCount: number;
  skippedCount: number;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCDate()).padStart(2, "0"),
  ].join("");
}

function dayIndexForDate(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function firstMeetingDate(dayCode: string): string {
  const termStartDayIndex = dayIndexForDate(CURRENT_INSTRUCTION_START_DATE);
  const offset = ((DAY_INDEX[dayCode] ?? termStartDayIndex) - termStartDayIndex + 7) % 7;
  return addDays(CURRENT_INSTRUCTION_START_DATE, offset);
}

function compactDate(date: string): string {
  return date.replaceAll("-", "");
}

function compactTime(time: string): string {
  return time.replace(":", "").padEnd(6, "0");
}

function escapeIcsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldIcsLine(line: string): string {
  const chunks: string[] = [];
  let remaining = line;
  while (remaining.length > 74) {
    chunks.push(remaining.slice(0, 74));
    remaining = ` ${remaining.slice(74)}`;
  }
  chunks.push(remaining);
  return chunks.join("\r\n");
}

function makeDescription(section: Section): string {
  const instructors = section.instructors?.length
    ? `Instructor: ${section.instructors.join(", ")}`
    : "Instructor: TBA";
  const crn = section.crn ? `CRN: ${section.crn}` : "";
  const units = section.units ? `Units: ${section.units}` : "";
  return [section.title, instructors, crn, units, `Term: ${CURRENT_TERM_LABEL}`]
    .filter(Boolean)
    .join("\n");
}

function timezoneBlock(): string[] {
  return [
    "BEGIN:VTIMEZONE",
    `TZID:${CURRENT_TERM_TIMEZONE}`,
    "X-LIC-LOCATION:America/Los_Angeles",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0800",
    "TZOFFSETTO:-0700",
    "TZNAME:PDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0700",
    "TZOFFSETTO:-0800",
    "TZNAME:PST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

export function createScheduleCalendar(sections: Section[]): CalendarExportResult {
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Adviso//UC Davis Schedule Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Adviso ${CURRENT_TERM_LABEL} Schedule`,
    `X-WR-TIMEZONE:${CURRENT_TERM_TIMEZONE}`,
    ...timezoneBlock(),
  ];

  let eventCount = 0;
  let skippedCount = 0;

  for (const section of sections) {
    for (const [meetingIndex, meeting] of section.meetings.entries()) {
      const days = meeting.days.filter((day) => ICS_DAY_CODES[day]);
      if (!days.length || !meeting.startTime || !meeting.endTime) {
        skippedCount += 1;
        continue;
      }

      const firstDay = days[0];
      const date = firstMeetingDate(firstDay);
      const byDays = days.map((day) => ICS_DAY_CODES[day]).join(",");
      const location = meeting.location || "UC Davis";
      const title = `${section.courseCode}${section.section ? ` ${section.section}` : ""}: ${section.title}`;
      const uid = `adviso-${section.crn}-${meetingIndex}@uc-davis-ai-advisor.local`;

      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${now}`,
        `SUMMARY:${escapeIcsText(title)}`,
        `DTSTART;TZID=${CURRENT_TERM_TIMEZONE}:${date}T${compactTime(meeting.startTime)}`,
        `DTEND;TZID=${CURRENT_TERM_TIMEZONE}:${date}T${compactTime(meeting.endTime)}`,
        `RRULE:FREQ=WEEKLY;UNTIL=${compactDate(CURRENT_INSTRUCTION_END_DATE)}T235959;BYDAY=${byDays}`,
        `LOCATION:${escapeIcsText(location)}`,
        `DESCRIPTION:${escapeIcsText(makeDescription(section))}`,
        "END:VEVENT"
      );
      eventCount += 1;
    }
  }

  lines.push("END:VCALENDAR");

  return {
    calendarText: lines.map(foldIcsLine).join("\r\n"),
    eventCount,
    skippedCount,
  };
}

export function downloadCalendarFile(calendarText: string, filename: string): void {
  const blob = new Blob([calendarText], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
