#!/usr/bin/env node
/**
 * Improved RMP scraper — searches by FULL instructor name 
 * (e.g. "Gabriel Simmons") for much better matching.
 * 
 * Uses the instructorDetails from our real UC Davis data.
 * 
 * Run: node scripts/scrape-rmp-full.mjs
 */

import fs from 'fs';
import path from 'path';

const RMP_GRAPHQL = 'https://www.ratemyprofessors.com/graphql';
const UC_DAVIS_SCHOOL_ID = 'U2Nob29sLTExMTU='; // UC Davis on RMP
const DELAY_MS = 600; // delay between requests to avoid rate limiting
const BATCH_SIZE = 5;  // concurrent requests per batch

// Load sections to get instructor full names
const sectionsPath = path.join(process.cwd(), 'data', 'sections', 'spring-2026.json');
const rmpPath = path.join(process.cwd(), 'data', 'rmp.json');

const sections = JSON.parse(fs.readFileSync(sectionsPath, 'utf-8'));
const existingRmp = JSON.parse(fs.readFileSync(rmpPath, 'utf-8'));

// Extract unique instructors with their full names
const instructorMap = new Map(); // "LastName, F" -> { firstName, lastName, fullName }
for (const s of sections) {
  const details = s.instructorDetails || [];
  const names = s.instructors || [];
  for (let i = 0; i < names.length; i++) {
    const shortName = names[i];
    if (!shortName || shortName === ', ' || instructorMap.has(shortName)) continue;
    if (i < details.length && details[i].fullName) {
      instructorMap.set(shortName, {
        firstName: details[i].firstName || '',
        lastName: details[i].lastName || '',
        fullName: details[i].fullName || '',
      });
    } else {
      // Parse from "LastName, F" format  
      const parts = shortName.split(', ');
      if (parts.length === 2) {
        instructorMap.set(shortName, {
          firstName: parts[1],
          lastName: parts[0],
          fullName: `${parts[1]} ${parts[0]}`,
        });
      }
    }
  }
}

console.log(`Found ${instructorMap.size} unique instructors`);
console.log(`Already have ${Object.keys(existingRmp).length} RMP profiles`);

// Skip instructors we already have
const toSearch = [];
for (const [shortName, info] of instructorMap.entries()) {
  if (!existingRmp[shortName]) {
    toSearch.push({ shortName, ...info });
  }
}
console.log(`Need to search for ${toSearch.length} instructors\n`);

async function searchRMP(searchQuery) {
  const body = JSON.stringify({
    query: `query NewSearchTeachersQuery($query: TeacherSearchQuery!) {
      newSearch {
        teachers(query: $query) {
          edges {
            node {
              id
              legacyId
              firstName
              lastName
              school { id name }
              avgRating
              avgDifficulty
              numRatings
              wouldTakeAgainPercent
              department
            }
          }
        }
      }
    }`,
    variables: {
      query: {
        text: searchQuery,
        schoolID: UC_DAVIS_SCHOOL_ID,
      },
    },
  });

  const res = await fetch(RMP_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic dGVzdDp0ZXN0',
    },
    body,
  });

  if (!res.ok) return [];
  const data = await res.json();
  return data?.data?.newSearch?.teachers?.edges?.map(e => e.node) || [];
}

function matchInstructor(results, instructor) {
  if (!results || results.length === 0) return null;
  
  const targetLast = instructor.lastName.toLowerCase();
  const targetFirst = instructor.firstName.toLowerCase();
  
  // Try exact last name + first name starts with
  for (const r of results) {
    const rLast = r.lastName.toLowerCase();
    const rFirst = r.firstName.toLowerCase();
    
    if (rLast === targetLast && (
      rFirst.startsWith(targetFirst) || 
      targetFirst.startsWith(rFirst) ||
      rFirst[0] === targetFirst[0]
    )) {
      return r;
    }
  }
  
  return null;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Process in batches
let found = 0;
let searched = 0;
const newRmp = { ...existingRmp };

for (let i = 0; i < toSearch.length; i += BATCH_SIZE) {
  const batch = toSearch.slice(i, i + BATCH_SIZE);
  
  const promises = batch.map(async (inst) => {
    try {
      // Search by last name (most reliable for RMP)
      const results = await searchRMP(inst.lastName);
      const match = matchInstructor(results, inst);
      
      if (match && match.numRatings > 0) {
        newRmp[inst.shortName] = {
          avgRating: match.avgRating,
          avgDifficulty: match.avgDifficulty,
          numRatings: match.numRatings,
          wouldTakeAgainPercent: match.wouldTakeAgainPercent >= 0 ? Math.round(match.wouldTakeAgainPercent) : null,
          department: match.department,
          legacyId: String(match.legacyId),
          isReal: true,
        };
        found++;
        console.log(`  ✓ ${inst.shortName} -> ${match.firstName} ${match.lastName} (${match.avgRating}★, ${match.numRatings} ratings)`);
      }
    } catch (e) {
      // Silently skip errors
    }
    searched++;
  });
  
  await Promise.all(promises);
  
  if (i % 50 === 0 || i + BATCH_SIZE >= toSearch.length) {
    console.log(`  Progress: ${searched}/${toSearch.length} searched, ${found} new matches found`);
  }
  
  await sleep(DELAY_MS);
}

// Save results
fs.writeFileSync(rmpPath, JSON.stringify(newRmp, null, 2));

// Also update sections with RMP data
for (const s of sections) {
  const rmpForSection = {};
  for (const inst of (s.instructors || [])) {
    if (newRmp[inst]) {
      rmpForSection[inst] = newRmp[inst];
    }
  }
  if (Object.keys(rmpForSection).length > 0) {
    s.rmp = rmpForSection;
  } else {
    delete s.rmp;
  }
}
fs.writeFileSync(sectionsPath, JSON.stringify(sections, null, 2));

const totalReal = Object.values(newRmp).filter(v => v?.isReal).length;
const sectionsWithRmp = sections.filter(s => s.rmp && Object.keys(s.rmp).length > 0).length;

console.log(`\n=== DONE ===`);
console.log(`Total real RMP profiles: ${totalReal}`);
console.log(`New matches found: ${found}`);
console.log(`Sections with RMP data: ${sectionsWithRmp}/${sections.length}`);
