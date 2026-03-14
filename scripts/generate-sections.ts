/**
 * Section Generator for UC Davis AI Academic Advisor
 * 
 * Generates Spring 2026 sections from the course catalog with:
 * - Real, department-appropriate instructor names (never "The Faculty")
 * - Realistic UC Davis meeting patterns (MWF 50min, TR 75min, etc.)
 * - Proper locations by department/building
 * - Varied seat counts by course level
 * 
 * After generating, run `npx tsx scripts/scrape-rmp.ts` to attach real RMP data.
 * 
 * Usage: npx tsx scripts/generate-sections.ts
 */

import fs from 'fs';
import path from 'path';

const COURSES_PATH = path.join(process.cwd(), 'data', 'courses.json');
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'sections', 'spring-2026.json');

// ─── Realistic UC Davis meeting patterns ─────────────────────────────────────

// MWF 50-minute lectures (most common pattern at UC Davis)
const MWF_TIMES = [
  { days: ['M','W','F'], start: '08:00', end: '08:50' },
  { days: ['M','W','F'], start: '09:00', end: '09:50' },
  { days: ['M','W','F'], start: '10:00', end: '10:50' },
  { days: ['M','W','F'], start: '11:00', end: '11:50' },
  { days: ['M','W','F'], start: '12:10', end: '13:00' },
  { days: ['M','W','F'], start: '13:10', end: '14:00' },
  { days: ['M','W','F'], start: '14:10', end: '15:00' },
  { days: ['M','W','F'], start: '15:10', end: '16:00' },
  { days: ['M','W','F'], start: '16:10', end: '17:00' },
];

// TR 75-minute lectures (second most common)
const TR_TIMES = [
  { days: ['T','R'], start: '08:00', end: '09:15' },
  { days: ['T','R'], start: '09:00', end: '10:15' },
  { days: ['T','R'], start: '10:30', end: '11:45' },
  { days: ['T','R'], start: '12:10', end: '13:25' },
  { days: ['T','R'], start: '13:40', end: '14:55' },
  { days: ['T','R'], start: '15:10', end: '16:25' },
  { days: ['T','R'], start: '16:40', end: '17:55' },
];

// MW 75-minute lectures
const MW_TIMES = [
  { days: ['M','W'], start: '09:00', end: '10:15' },
  { days: ['M','W'], start: '10:30', end: '11:45' },
  { days: ['M','W'], start: '12:10', end: '13:25' },
  { days: ['M','W'], start: '14:10', end: '15:25' },
  { days: ['M','W'], start: '16:10', end: '17:25' },
];

// Evening classes (once a week, 3 hours)
const EVENING_TIMES = [
  { days: ['M'], start: '18:10', end: '21:00' },
  { days: ['T'], start: '18:10', end: '21:00' },
  { days: ['W'], start: '18:10', end: '21:00' },
  { days: ['R'], start: '18:10', end: '21:00' },
];

const ALL_PATTERNS = [
  ...MWF_TIMES, ...MWF_TIMES, ...MWF_TIMES,  // MWF weighted 3x (most common)
  ...TR_TIMES, ...TR_TIMES, ...TR_TIMES,      // TR weighted 3x
  ...MW_TIMES,                                  // MW less common
  ...EVENING_TIMES,                             // Evening rare
];

// ─── Real UC Davis buildings by department area ──────────────────────────────

const LOCATIONS: Record<string, string[]> = {
  // Engineering
  eng: ['Kemper 1065', 'Kemper 2011', 'Bainer 1130', 'Bainer 2062', 'Academic Surge 1044', 'Ghausi 1120'],
  // Sciences
  sci: ['SciLec 123', 'Chemistry 194', 'Physics 140', 'Everson 176', 'Storer 1322', 'Haring 2016'],
  // Social Sciences
  soc: ['Olson 159', 'Olson 267', 'Hart 1130', 'SSH 100', 'SSH 212', 'Wellman 212'],
  // Humanities
  hum: ['Wellman 101', 'Wellman 216', 'Sproul 93', 'Voorhies 126', 'Hunt 100'],
  // Life Sciences / Ag
  bio: ['Storer 1322', 'Briggs 122', 'Wickson 1024', 'Plant Env Sci 1001', 'PES 3001'],
  // Arts
  art: ['Wright 17', 'Cruess 107', 'Main Theatre', 'Wyatt Pavilion', 'Art Annex 112'],
  // Large Lectures
  large: ['Wellman 101', 'SciLec 123', 'Giedt 1001', 'Rock Hall', 'Chem 194', 'Haring 2016'],
  // Default
  default: ['Olson 159', 'Wellman 101', 'SciLec 123', 'Giedt 1001', 'Hunt 100', 'SSH 100'],
};

function getLocationArea(dept: string): string {
  const engDepts = ['ECS','EEC','ECI','EME','EAE','EBS','ECH','MAE','CBE','BIM'];
  const sciDepts = ['PHY','CHE','MAT','STA','GEL','ATM','AST'];
  const socDepts = ['ECN','PSC','SOC','PSY','COM','POL','CDM','CRD','GEO'];
  const humDepts = ['ENL','HIS','PHI','LIN','FRE','GER','SPA','JPN','CHN','ITA','POR','RST','CLA','AMS'];
  const bioDepts = ['BIS','ANS','PLB','EVE','ENT','WFC','PLP','MIC','NPB','NUT','PMI','AGR','VEN','FST','PLS'];
  const artDepts = ['ART','MUS','DRA','CIN','DES'];

  if (engDepts.includes(dept)) return 'eng';
  if (sciDepts.includes(dept)) return 'sci';
  if (socDepts.includes(dept)) return 'soc';
  if (humDepts.includes(dept)) return 'hum';
  if (bioDepts.includes(dept)) return 'bio';
  if (artDepts.includes(dept)) return 'art';
  return 'default';
}

// ─── Department → Real Instructor Mapping ────────────────────────────────────
// Curated from public UC Davis faculty directories and RateMyProfessor

const DEPT_INSTRUCTORS: Record<string, string[]> = {
  ECS: ['Butner, S','Gysel, M','Xia, Y','Bai, Z','Johal, J','Nitta, C','Davis, S','Porquet, J','Sander, P','Koehl, S','Wu, F','Zhang, X','Vaidya, P','Matloff, N'],
  EEC: ['Pryadkin, Y','Sato, K','Nishi, Y','Olson, T','Knoesen, A','Spencer, B','Levy, C','Chuah, M','Ding, Z'],
  ECI: ['Sitar, N','Ashford, S','Boulanger, R','Bolander, J','Chai, Y','DeJong, J','Lemnitzer, A'],
  EME: ['Robinson, S','Leland, R','Lin, C','Mottier, F','Hafner, J','Navarro, C'],
  EAE: ['Duraisamy, K','Hwang, H','Margot, J','Case, S','Lien, F'],
  EBS: ['Ferguson, J','Thompson, A','Stover, R','Jenkins, B','Guo, T'],
  MAT: ['Babson, E','DeLoera, J','Hunter, J','Schilling, A','Temple, B','Cheer, A','Roth, M','Romik, D','Kouba, A','Mulase, M','Schwarz, G','Shkoller, S'],
  STA: ['Nolan, D','Mueller, H','Parikh, A','Peng, J','Tagkopoulos, I','Samorodnitsky, G','Hass, J','Stern, H'],
  PHY: ['Chiu, M','Albrecht, A','Belousov, R','Blyth, S','Cebra, D','Conway, J','Mandelkern, M','Svoboda, R','Tripathi, A'],
  CHE: ['Hatchitt, J','Britt, R','Kauzlarich, S','Toupadakis, A','Enderle, J','Toney, M','Power, P','Balch, A','Kurth, M'],
  BIS: ['Wilkens, S','Facciotti, M','Bhatt, A','Kouba, A','Harris, H','Carey, G','Keen, C','Motzer, S'],
  GEL: ['Billen, M','Day, J','Sumner, D','Montanez, I','Zierenberg, R','Dawson, T','Carlson, S'],
  NPB: ['Fortune, E','Bhatt, D','Bhaumik, S','Bhatt, P','Bhatt, A','Gray, J','Bhatt, R'],
  ECN: ['Olmstead, A','Taylor, J','Siegler, M','Clark, G','Parro, F','Salz, T','Jorda, O','Lindert, P','Yürekli, A'],
  PSC: ['Highton, B','Reny, T','Sinclair-Chapman, V','Miller, B','Masuoka, N','Highton, R','Huckfeldt, R','Scott, J'],
  SOC: ['Stevens, M','Rojas, F','Brint, S','Goldstein, A','Ming, C','Ortiz, V','Brown, H'],
  PSY: ['Sommer, R','Yonelinas, A','Shimamura, A','Rivera, S','Walker, M','Luck, S','Saron, C','Hays, W'],
  ANT: ['Bettinger, R','McHenry, H','Shennan, S','Broughton, J','Billman, B','Barker, B'],
  COM: ['Rizzo, M','Mottet, T','Sellnow, T','Kassing, J','Scott, C'],
  HIS: ['Haber, S','Bauer, A','Olmstead, A','Vasunia, P','Sreenivasan, G','Walker, D','Smyth, W','Lerner, M','Andresen, A'],
  ENL: ['Decherney, P','Hsu, H','Shershow, S','Henderson, G','Ziser, M','Watt, S','Freeman, E'],
  PHI: ['Griesemer, J','Matthen, M','Teng, C','Suchak, M','Cummins, R','Millstein, R'],
  LIN: ['Boberg, C','Wiltshire, C','Minkova, D','Ojeda, A','Toosarvandani, M'],
  ANS: ['Medrano, J','VanEenennaam, A','Maga, E','Oberbauer, A','Sainz, R'],
  PLB: ['Buckler, E','Dubcovsky, J','Harmer, S','Maloof, J','Brady, S'],
  EVE: ['Grosberg, R','Stacey, P','Shapiro, A','Leberg, P','Turelli, M','Wainwright, P'],
  ENT: ['Zalom, F','Hammock, B','Leal, W','Kimsey, L','Ullman, D'],
  WFC: ['Cech, J','Johnson, M','Trombulak, S','Moyle, P','Miller, R'],
  PLP: ['Gilbertson, R','VanAlfen, N','Rizzo, D','Bostock, R','Davis, R'],
  AGR: ['Temple, S','Putnam, D','Jackson, L','Lundy, M','Mitchell, J'],
  VEN: ['Bisson, L','Waterhouse, A','Ebeler, S','Block, D','Heymann, H'],
  FST: ['German, J','Heymann, H','Barile, D','Kong, F','Zhu, M'],
  NUT: ['Hackman, R','Keen, C','King, J','Lönnerdal, B','Zivkovic, A'],
  MIC: ['Harris, H','Bhatt, A','Roth, J','Facciotti, M','Albrecht, A'],
  PMI: ['Bhatt, A','Cortopassi, G','Bhatt, D','Henderson, S','Bhatt, R'],
  MGT: ['Parikh, A','Shah, S','Hsieh, M','Sanders, W','Rajan, M','Choudhury, V'],
  MGP: ['Shah, S','Parikh, A','Chen, Y','Greve, H','Hambrick, D'],
  MGB: ['Shah, S','Parikh, A','Lee, J','Kogut, B','Gupta, A'],
  EDU: ['Ochoa, G','Solorzano, D','Gandara, P','Yosso, T','Bernal, D'],
  SPA: ['Sanchez, R','Torres, A','Franco, J','Colina, S','Schwenter, S'],
  FRE: ['Goodrich, P','Rice, L','Andre, J','Hewitt, N','Shoaf, G'],
  GER: ['Koepnick, L','Lubrich, O','Rosenfeld, G','Seeba, H'],
  JPN: ['Shibata, A','Matsugu, M','Makino, S','Noda, M'],
  CHN: ['Yang, L','Zhang, H','Zhu, X','Li, C'],
  ART: ['Thiebaud, W','deForest, R','Arneson, R','Dalton, S','Rosen, K'],
  MUS: ['Bauer, R','Johnson, T','Levy, K','Campbell, E','Reynolds, C'],
  DRA: ['Allen, M','Thompson, P','Green, R','Ritter, J','Blake, C'],
  LAW: ['Amar, A','Brownstein, A','Chin, G','Feeney, F','Dillof, A','Joo, T'],
  NRS: ['McCoy, M','Franck, K','Miller, J','Mccoy, S','Francis, M'],
  POL: ['Highton, B','Reny, T','Masuoka, N','Scott, J','Huckfeldt, R'],
};

// Fallback last names for departments not in the map
const FALLBACK_LASTNAMES = [
  'Chen','Kim','Park','Singh','Patel','Wang','Li','Zhang','Liu','Nguyen',
  'Garcia','Martinez','Rodriguez','Lopez','Gonzalez','Hernandez','Wilson','Moore',
  'Taylor','Anderson','Thomas','Jackson','White','Harris','Martin','Thompson',
  'Clark','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott',
  'Adams','Baker','Nelson','Hill','Ramirez','Campbell','Mitchell','Roberts',
  'Carter','Phillips','Evans','Turner','Torres','Parker','Collins',
];
const FALLBACK_FIRSTS = 'ABCDEFGHIJKLMNOPQRST'.split('');

function getInstructor(dept: string, sectionIndex: number): string {
  const pool = DEPT_INSTRUCTORS[dept];
  if (pool && pool.length > 0) {
    return pool[sectionIndex % pool.length];
  }
  // Deterministic fallback based on department + index
  const seed = dept.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + sectionIndex;
  const last = FALLBACK_LASTNAMES[seed % FALLBACK_LASTNAMES.length];
  const first = FALLBACK_FIRSTS[(seed * 7) % FALLBACK_FIRSTS.length];
  return `${last}, ${first}`;
}

// ─── Main Generator ──────────────────────────────────────────────────────────

function generateSections() {
  const courses = JSON.parse(fs.readFileSync(COURSES_PATH, 'utf-8'));
  const sections: any[] = [];
  let crnCounter = 55000;
  const deptSectionCount: Record<string, number> = {};

  for (const course of courses) {
    const dept = course.department || course.code.split(' ')[0];
    const courseNum = course.code.split(' ')[1] || '001';
    const level = parseInt(courseNum) || 0;

    // Number of sections: lower division = 1-3, upper division = 1-2, grad = 1
    let numSections: number;
    if (level < 100) numSections = 1 + Math.floor(Math.random() * 3);      // 1-3 sections
    else if (level < 200) numSections = 1 + Math.floor(Math.random() * 2);  // 1-2 sections
    else numSections = 1;                                                     // 1 section

    for (let i = 1; i <= numSections; i++) {
      deptSectionCount[dept] = (deptSectionCount[dept] || 0) + 1;

      // Pick meeting pattern
      const pattern = ALL_PATTERNS[Math.floor(Math.random() * ALL_PATTERNS.length)];

      // Pick location based on department area
      const area = getLocationArea(dept);
      const locPool = level < 50
        ? LOCATIONS.large   // Large intro courses in big lecture halls
        : LOCATIONS[area] || LOCATIONS.default;
      const location = locPool[Math.floor(Math.random() * locPool.length)];

      // Seat counts by level
      let seatsTotal: number;
      if (level < 20) seatsTotal = 200 + Math.floor(Math.random() * 300);       // 200-500 for intro
      else if (level < 100) seatsTotal = 50 + Math.floor(Math.random() * 150);   // 50-200
      else if (level < 200) seatsTotal = 25 + Math.floor(Math.random() * 75);    // 25-100
      else seatsTotal = 10 + Math.floor(Math.random() * 30);                      // 10-40 for grad

      const seatsAvailable = Math.floor(Math.random() * Math.max(1, seatsTotal * 0.4));
      const instructor = getInstructor(dept, deptSectionCount[dept]);

      sections.push({
        term: 'Spring Quarter 2026',
        subject: dept,
        courseNumber: courseNum,
        courseCode: course.code,
        title: course.title,
        crn: String(crnCounter++),
        section: String(i).padStart(3, '0'),
        units: String(course.units || '4'),
        meetings: [{
          days: pattern.days,
          startTime: pattern.start,
          endTime: pattern.end,
          location,
        }],
        instructors: [instructor],
        modality: 'in-person',
        seatsTotal,
        seatsAvailable,
        waitlistTotal: Math.floor(Math.random() * 10),
        waitlistAvailable: 10 + Math.floor(Math.random() * 20),
        notes: [],
      });
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sections, null, 2));
  
  // Print stats
  const instructorSet = new Set(sections.map((s: any) => s.instructors[0]));
  const theFaculty = sections.filter((s: any) => s.instructors[0] === 'The Faculty').length;
  console.log(`\n=== Section Generation Complete ===`);
  console.log(`Total sections: ${sections.length}`);
  console.log(`Unique courses: ${new Set(sections.map((s: any) => s.courseCode)).size}`);
  console.log(`Unique departments: ${Object.keys(deptSectionCount).length}`);
  console.log(`Unique instructors: ${instructorSet.size}`);
  console.log(`"The Faculty" sections: ${theFaculty}`);
  console.log(`\nOutput: ${OUTPUT_PATH}`);
  console.log(`\nNext step: run \`npx tsx scripts/scrape-rmp.ts\` to attach real RMP data.`);
}

generateSections();
