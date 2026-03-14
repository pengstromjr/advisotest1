#!/usr/bin/env node
/**
 * Real UC Davis Schedule Builder Scraper
 * 
 * Uses an authenticated session to pull ALL real Spring 2026 section data
 * from the UC Davis Schedule Builder internal API.
 * 
 * Usage: node scripts/scrape-real-sections.mjs
 */

// ─── Auth Config (from user's session) ───────────────────────────────────────
const COOKIES = 'CFID=5842831; CFTOKEN=8da63b33cddc02c2-0167A4F0-C80E-A28E-BD27AE7D5476543D; CF_CAS=7FC643976C75626A5F589E2C326114A8; BIGipServerQS-MYUCD-PROD.pool=1159821440.47873.0000';
const PIDM = '4224157';
const TERM_CODE = '202603'; // Spring Quarter 2026

const API_URL = 'https://my.ucdavis.edu/schedulebuilder/cf/search/search.cfc';

// ─── All UC Davis subject codes ──────────────────────────────────────────────
const SUBJECTS = [
  'AAS','ABG','ABT','AED','AET','AGC','AGE','AGR','AHI','AMS','ANA','ANB',
  'ANE','ANS','ANT','APH','APC','ARE','ART','ASA','ASE','AST','ATM',
  'BIM','BIS','BMB','BPH','BPT','BST',
  'CDB','CDM','CGS','CHE','CHI','CHN','CLA','CLH','CMN','CMP','CNE','COG','COM','CRI','CRD','CTS',
  'DES','DRA',
  'EAD','EAE','EAL','EBS','ECH','ECI','ECL','ECN','ECO','ECS','EDU','EEC','EJS','EME','EMS','ENG','ENH','ENL','ENT','ENP','ENV','EPG','EPP','ESP','ESM','ETX','EVE','EXB',
  'FMS','FOR','FPS','FRE','FRS','FSM','FST',
  'GDB','GEL','GEO','GER','GRK','GRD',
  'HDE','HIS','HMR','HNR','HPS','HRT','HSO','HUM','HYD',
  'IAD','IDI','IMM','INT','IRE','IST','ITA',
  'JPN','JST',
  'KOR',
  'LAN','LAT','LAW','LDA','LIN',
  'MAE','MAS','MAT','MCB','MDS','MGP','MGT','MIB','MIC','MPS','MSA','MSC','MUS',
  'NAC','NAS','NAT','NBI','NEM','NEU','NPB','NRS','NSC','NUT',
  'OBG','OEH','ONE','OPT',
  'PAS','PBI','PFS','PGG','PHA','PHE','PHI','PHR','PHS','PHY','PLA','PLB','PLP','PLS','PMD','PMI','POL','POM','POR','PPA','PPP','PSC','PSY','PTX',
  'RMT','RST','RUS',
  'SAS','SDS','SOC','SOX','SPA','SPH','SSC','STA','STP',
  'TCS','TEX','THE','TTP',
  'URB',
  'VEN','VET','VMB','VMD','VPH',
  'WFC','WLD','WMS',
];

// ─── Rate limiting ───────────────────────────────────────────────────────────
const DELAY_MS = 400; // 400ms between requests to be polite
const BATCH_SIZE = 3;

async function searchSubject(subject) {
  const filters = JSON.stringify({ searchTerm: subject, addFilters: '' });
  const body = `method=search&termCode=${TERM_CODE}&filters=${encodeURIComponent(filters)}&pidm=${PIDM}`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Cookie': COOKIES,
      'Origin': 'https://my.ucdavis.edu',
      'Referer': `https://my.ucdavis.edu/schedulebuilder/index.cfm?termCode=${TERM_CODE}&helpTour=`,
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    body,
  });

  if (!res.ok) {
    console.error(`  ✗ ${subject}: HTTP ${res.status}`);
    return [];
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function formatTime(militaryTime) {
  if (!militaryTime) return '';
  const s = String(militaryTime).padStart(4, '0');
  return `${s.slice(0, 2)}:${s.slice(2)}`;
}

function parseDays(meeting) {
  const days = [];
  if (meeting.monday) days.push('M');
  if (meeting.tuesday) days.push('T');
  if (meeting.wednesday) days.push('W');
  if (meeting.thursday) days.push('R');
  if (meeting.friday) days.push('F');
  return days;
}

function transformSection(raw) {
  const c = raw.course || {};
  const meetings = (raw.meeting || []).map(m => ({
    days: parseDays(m),
    startTime: formatTime(m.startTime),
    endTime: formatTime(m.endTime),
    location: `${m.building || ''} ${m.room || ''}`.trim(),
    type: m.type || 'LEC',
    description: m.description || '',
  }));

  const instructors = (raw.instructor || []).map(i => ({
    name: `${i.lastName}, ${i.firstName?.charAt(0) || ''}`,
    fullName: i.fullName || `${i.firstName} ${i.lastName}`,
    email: i.instructorEmail || '',
  }));

  const icms = raw.icmsData || {};

  return {
    term: 'Spring Quarter 2026',
    subject: c.subjectCode || '',
    courseNumber: c.courseNum || '',
    courseCode: `${c.subjectCode || ''} ${c.courseNum || ''}`.trim(),
    title: c.title || '',
    crn: c.crn || c.printCRN || '',
    section: c.seqNum || '001',
    units: String(c.unitsLow || '4'),
    unitsHigh: c.unitsHigh || 0,
    meetings,
    instructors: instructors.map(i => i.name),
    instructorDetails: instructors,
    modality: 'in-person',
    seatsTotal: 0,  // Not in search API, set later
    seatsAvailable: null,
    waitlistTotal: null,
    waitlistAvailable: null,
    notes: [],
    // Real catalog data
    description: icms.newDescription || '',
    prerequisites: icms.prereq || '',
    creditLimit: icms.creditLimit || '',
    geAreas: icms.ge3 ? icms.ge3.split(',').map(s => s.trim()).filter(Boolean) : [],
    crossListing: icms.crossListing || '',
    finalExam: raw.finalExam?.examDate || '',
    subjectDesc: c.subjectDesc || '',
    gradeMode: c.gradeMode || '',
    reservedSeating: c.reservedSeating || false,
  };
}

async function main() {
  console.log('=== UC Davis Real Section Scraper ===');
  console.log(`Term: Spring Quarter 2026 (${TERM_CODE})`);
  console.log(`Subjects to scrape: ${SUBJECTS.length}\n`);

  const allSections = [];
  let totalRaw = 0;
  let failed = 0;
  let empty = 0;

  // Process in batches
  for (let i = 0; i < SUBJECTS.length; i += BATCH_SIZE) {
    const batch = SUBJECTS.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(batch.map(async (subject) => {
      const raw = await searchSubject(subject);
      return { subject, raw };
    }));

    for (const { subject, raw } of results) {
      if (raw.length === 0) {
        empty++;
        continue;
      }
      totalRaw += raw.length;
      const transformed = raw.map(transformSection);
      allSections.push(...transformed);
      console.log(`  ✓ ${subject}: ${raw.length} sections`);
    }

    // Progress
    const done = Math.min(i + BATCH_SIZE, SUBJECTS.length);
    if (done % 30 === 0 || done === SUBJECTS.length) {
      console.log(`\n  [${Math.round(done / SUBJECTS.length * 100)}%] ${done}/${SUBJECTS.length} subjects | ${allSections.length} sections total\n`);
    }

    // Rate limit
    if (i + BATCH_SIZE < SUBJECTS.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  // Write output
  const fs = await import('fs');
  const path = await import('path');
  const outPath = path.default.join(process.cwd(), 'data', 'sections', 'spring-2026.json');
  fs.default.writeFileSync(outPath, JSON.stringify(allSections, null, 2));

  // Also save instructor list for RMP scraping
  const instructorSet = new Set();
  allSections.forEach(s => {
    s.instructors?.forEach(name => {
      if (name && name !== ', ') instructorSet.add(name);
    });
  });

  console.log('\n=== Scrape Complete ===');
  console.log(`Total sections: ${allSections.length}`);
  console.log(`Unique courses: ${new Set(allSections.map(s => s.courseCode)).size}`);
  console.log(`Unique instructors: ${instructorSet.size}`);
  console.log(`Subjects with data: ${SUBJECTS.length - empty - failed}`);
  console.log(`Empty subjects: ${empty}`);
  console.log(`Failed subjects: ${failed}`);
  console.log(`\nOutput: ${outPath}`);
  console.log('\nNext: run \`npx tsx scripts/scrape-rmp.ts\` to attach real RMP ratings.');
}

main().catch(console.error);
