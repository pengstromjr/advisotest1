/**
 * UC Davis Schedule Builder Scraper — Browser Console Script
 * 
 * INSTRUCTIONS:
 * 1. Go to https://my.ucdavis.edu and log in with your UC Davis credentials
 * 2. Navigate to Schedule Builder → Class Search 
 * 3. Open browser DevTools (F12 or Cmd+Option+I)
 * 4. Go to the "Console" tab
 * 5. Paste this ENTIRE script and press Enter
 * 6. Wait for it to finish (it will show progress)
 * 7. The JSON data will be automatically copied to your clipboard
 * 8. Create a file called data/sections/spring-2026-real.json in the project
 * 9. Paste the clipboard contents into that file
 * 10. Run: npx tsx scripts/import-real-data.ts
 */

(async function scrapeScheduleBuilder() {
  console.log('=== UC Davis Schedule Builder Scraper ===');
  console.log('Scraping Spring Quarter 2026 section data...\n');

  // The Schedule Builder uses an internal API — we need to discover the right endpoint
  // Common patterns: /api/sections, /api/classsearch, /api/schedule/search
  
  // Step 1: Get the list of all subjects
  const subjects = [];
  const subjectElements = document.querySelectorAll('[data-subject], option[value]');
  
  // Try to find subjects from the page
  if (subjectElements.length === 0) {
    // If we can't find subjects from DOM, use our known list
    console.log('Could not find subjects in page DOM. Trying API approach...');
  }
  
  // Try to intercept the API by searching for a known subject
  // First, let's check what network requests the page makes
  
  const allSections = [];
  let apiBase = '';
  
  // Try common Schedule Builder API patterns
  const possibleApis = [
    '/api/v1/search/sections',
    '/api/classsearch/v1/search',
    '/schedule-builder/api/search',
    '/schedulebuilder/api/sections',
    '/api/schedule/sections',
  ];

  // Method 1: Try to use the existing page's search functionality
  console.log('Attempting to discover API endpoint...');
  
  // Intercept XHR/fetch to find the real API
  const originalFetch = window.fetch;
  let discoveredUrl = null;
  
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (url.includes('section') || url.includes('search') || url.includes('class') || url.includes('course')) {
      discoveredUrl = url;
      console.log('Discovered API URL:', url);
    }
    return originalFetch.apply(this, args);
  };

  // Method 2: Scrape directly from the page DOM
  console.log('\nScraping from page DOM...');
  
  // Look for course/section data already loaded in the page
  const courseCards = document.querySelectorAll('.course-card, .section-row, .class-row, [class*="course"], [class*="section"], tr[data-crn], [data-crn]');
  
  if (courseCards.length > 0) {
    console.log(`Found ${courseCards.length} section elements in the DOM.`);
    
    courseCards.forEach(card => {
      try {
        const crn = card.getAttribute('data-crn') || 
                    card.querySelector('[data-crn]')?.getAttribute('data-crn') ||
                    card.querySelector('.crn, [class*="crn"]')?.textContent?.trim();
        
        const courseCode = card.querySelector('.course-code, [class*="course-code"], [class*="subject"]')?.textContent?.trim() || '';
        const title = card.querySelector('.course-title, [class*="title"]')?.textContent?.trim() || '';
        const instructor = card.querySelector('.instructor, [class*="instructor"]')?.textContent?.trim() || '';
        const meetings = card.querySelector('.meetings, .schedule, [class*="meeting"], [class*="schedule"]')?.textContent?.trim() || '';
        const seats = card.querySelector('.seats, [class*="seats"], [class*="enrollment"]')?.textContent?.trim() || '';
        const units = card.querySelector('.units, [class*="unit"]')?.textContent?.trim() || '';
        const location = card.querySelector('.location, [class*="location"], [class*="room"]')?.textContent?.trim() || '';

        if (crn || courseCode) {
          allSections.push({
            crn: crn || 'unknown',
            courseCode,
            title,
            instructor,
            meetings,
            seats,
            units,
            location,
            raw: card.textContent?.trim().substring(0, 500),
          });
        }
      } catch (e) {
        // skip this card
      }
    });
  }

  // Method 3: Check for embedded JSON data in the page
  const scripts = document.querySelectorAll('script');
  scripts.forEach(script => {
    const text = script.textContent || '';
    if (text.includes('"crn"') || text.includes('"courseCode"') || text.includes('"sections"')) {
      try {
        // Try to find JSON arrays in script tags
        const matches = text.match(/\[[\s\S]*?"crn"[\s\S]*?\]/g);
        if (matches) {
          for (const match of matches) {
            try {
              const data = JSON.parse(match);
              if (Array.isArray(data)) {
                console.log(`Found embedded JSON data with ${data.length} items`);
                allSections.push(...data);
              }
            } catch { /* not valid JSON */ }
          }
        }
      } catch { /* skip */ }
    }
  });

  // Method 4: Check window/global state
  const stateKeys = ['__NEXT_DATA__', '__INITIAL_STATE__', 'window.__data', 'appState'];
  for (const key of stateKeys) {
    try {
      const val = eval(key);
      if (val) {
        console.log(`Found global state: ${key}`);
        const json = JSON.stringify(val);
        if (json.includes('crn') || json.includes('section')) {
          console.log(`  Contains section data!`);
        }
      }
    } catch { /* not defined */ }
  }

  // Restore original fetch
  window.fetch = originalFetch;

  // Output results
  if (allSections.length > 0) {
    const jsonStr = JSON.stringify(allSections, null, 2);
    
    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(jsonStr);
      console.log(`\n✅ SUCCESS! Scraped ${allSections.length} sections.`);
      console.log('Data has been copied to your clipboard!');
      console.log('Paste it into: data/sections/spring-2026-real.json');
    } catch {
      console.log(`\n✅ Scraped ${allSections.length} sections.`);
      console.log('Could not copy to clipboard. Outputting to console instead:');
      console.log('Copy the data below and paste into: data/sections/spring-2026-real.json');
      console.log(jsonStr);
    }
  } else {
    console.log('\n⚠️  Could not automatically scrape section data from this page.');
    console.log('\nPlease try the MANUAL method instead:');
    console.log('1. In Schedule Builder, search for a subject (e.g., "ECS")');
    console.log('2. Open DevTools → Network tab');
    console.log('3. Look for XHR/Fetch requests that return JSON with section data');
    console.log('4. Right-click the request → Copy → Copy response');
    console.log('5. Save each response and run the import script');
    console.log('\nAlternatively, paste the URL of any API request you see here:');
    
    if (discoveredUrl) {
      console.log(`\nDiscovered API URL: ${discoveredUrl}`);
      console.log('Try fetching this URL directly in the console.');
    }
  }
})();
