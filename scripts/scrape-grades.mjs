#!/usr/bin/env node
/**
 * CattleLog Grade Distribution Scraper
 * 
 * Fetches detailed grade distributions from daviscattlelog.com's API
 * for all courses in our sections data.
 * 
 * Run: node scripts/scrape-grades.mjs
 */

import fs from 'fs';
import path from 'path';

const API_BASE = 'https://api.daviscattlelog.com/api/courses';
const DELAY_MS = 600;
const BATCH_SIZE = 5;

const sectionsPath = path.join(process.cwd(), 'data', 'sections', 'spring-2026.json');
const gradesPath = path.join(process.cwd(), 'data', 'grades.json');

const sections = JSON.parse(fs.readFileSync(sectionsPath, 'utf-8'));

// Load existing grades to resume interrupted runs
let existingGrades = {};
try {
  existingGrades = JSON.parse(fs.readFileSync(gradesPath, 'utf-8'));
} catch {
  // First run
}

// Collect unique course codes
const courseCodes = [...new Set(sections.map(s => s.courseCode))];
console.log(`Found ${courseCodes.length} unique course codes`);
console.log(`Already have grades for ${Object.keys(existingGrades).length} courses\n`);

/**
 * Convert our course code to CattleLog's format:
 *   "ECS 036A" -> "ECS36A"  (strip spaces, strip leading zeros from number)
 *   "MAT 021A" -> "MAT21A"
 *   "CHE 002A" -> "CHE2A"
 */
function toCattlelogId(courseCode) {
  // Split into subject and number parts
  const match = courseCode.match(/^([A-Z]+)\s*(\d+\w*)$/);
  if (!match) {
    // Handle codes like "STA 013Y" or "PHY 009HA"
    const parts = courseCode.split(/\s+/);
    if (parts.length === 2) {
      const num = parts[1].replace(/^0+/, '') || '0';
      return parts[0] + num;
    }
    return courseCode.replace(/\s+/g, '');
  }
  
  const subject = match[1];
  const number = match[2].replace(/^0+/, '') || '0'; // Strip leading zeros
  return subject + number;
}

async function fetchGrades(courseCode) {
  const cattlelogId = toCattlelogId(courseCode);
  const url = `${API_BASE}/${cattlelogId}/grades`;
  
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (res.status === 404) return null; // Course not in CattleLog
    if (!res.ok) return null;
    
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Filter to courses we don't have yet
const toFetch = courseCodes.filter(code => !existingGrades[code]);
console.log(`Need to fetch ${toFetch.length} courses\n`);

let found = 0;
let notFound = 0;
let errors = 0;
const grades = { ...existingGrades };

for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
  const batch = toFetch.slice(i, i + BATCH_SIZE);
  
  const promises = batch.map(async (code) => {
    const data = await fetchGrades(code);
    
    if (data && data.overall_gpa !== undefined) {
      grades[code] = {
        overall_gpa: data.overall_gpa,
        overall_grades: data.overall_grades,
        overall_enrolled: data.overall_enrolled,
        available_quarters: data.available_quarters,
        professors: (data.professors || []).map(p => ({
          name: p.professor_name,
          slug: p.professor_slug,
          totalGpa: p.professor_quarter_data?.Total?.quarter_average_gpa,
          totalEnrolled: p.professor_quarter_data?.Total?.quarter_enrolled,
          totalGrades: p.professor_quarter_data?.Total?.quarter_grade_distribution,
        })),
      };
      found++;
      console.log(`  ✓ ${code} -> GPA: ${data.overall_gpa}, ${data.overall_enrolled} students`);
    } else {
      notFound++;
    }
  });
  
  await Promise.all(promises);
  
  // Progress update every 50 courses
  if ((i > 0 && i % 50 === 0) || i + BATCH_SIZE >= toFetch.length) {
    console.log(`  Progress: ${Math.min(i + BATCH_SIZE, toFetch.length)}/${toFetch.length} | Found: ${found} | Not found: ${notFound}`);
    // Save incrementally every 100 courses in case of interruption
    if (i % 100 === 0) {
      fs.writeFileSync(gradesPath, JSON.stringify(grades, null, 2));
    }
  }
  
  await sleep(DELAY_MS);
}

// Final save
fs.writeFileSync(gradesPath, JSON.stringify(grades, null, 2));

console.log(`\n=== DONE ===`);
console.log(`Total courses with grades: ${Object.keys(grades).length}`);
console.log(`New grades found: ${found}`);
console.log(`Courses not in CattleLog: ${notFound}`);
console.log(`Saved to ${gradesPath}`);
