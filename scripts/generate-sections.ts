
import fs from 'fs';
import path from 'path';

const COURSES_PATH = path.join(process.cwd(), 'data', 'courses.json');
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'sections', 'spring-2026.json');

const DAYS = ['M', 'T', 'W', 'R', 'F'];
const START_TIMES = ['08:00', '09:00', '10:00', '11:00', '12:10', '13:10', '14:10', '15:10', '16:10', '17:10', '18:10'];
const LOCATIONS = ['Wellman 101', 'Bainer 1130', 'Giedt 1001', 'SciLec 123', 'Olson 159', 'Rock Hall', 'Hunt 100', 'Storer 1322'];
const INSTRUCTORS = [
  "Gupta, S", "Loupos, P", "Deeb Sossa, N", "Ruiz, J", "Theobald, J", 
  "Hilbert, M", "Pena, J", "White, J", "Smith, A", "Johnson, B", 
  "Williams, C", "Jones, D", "Brown, E", "Davis, F", "Miller, G",
  "Wilson, H", "Moore, I", "Taylor, J", "Anderson, K", "Thomas, L"
];

function generateSections() {
  const courses = JSON.parse(fs.readFileSync(COURSES_PATH, 'utf-8'));
  const sections = [];
  let crnCounter = 55000;

  for (const course of courses) {
    // Generate 1-2 sections per course
    const numSections = Math.floor(Math.random() * 2) + 1;
    
    for (let i = 1; i <= numSections; i++) {
        const startTime = START_TIMES[Math.floor(Math.random() * START_TIMES.length)];
        const [h, m] = startTime.split(':').map(Number);
        const endTime = `${String(h + (Math.random() > 0.5 ? 1 : 2)).padStart(2, '0')}:${String(m + (Math.random() > 0.5 ? 0 : 50)).padStart(2, '0')}`;
        
        const numDays = Math.floor(Math.random() * 3) + 1;
        const selectedDays = [];
        const dayPool = [...DAYS];
        for (let j = 0; j < numDays; j++) {
            const idx = Math.floor(Math.random() * dayPool.length);
            selectedDays.push(dayPool.splice(idx, 1)[0]);
        }
        selectedDays.sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));

        // Accuracy First: Default to "The Faculty" unless it's a "Real" candidate
        // We'll give ~10% of sections a real instructor name to keep Discovery interesting,
        // but the vast majority will be anonymous as in a real catalog without perfect data.
        const isRealCandidate = Math.random() < 0.1;
        const instructor = isRealCandidate 
            ? INSTRUCTORS[Math.floor(Math.random() * INSTRUCTORS.length)]
            : "The Faculty";

        sections.push({
            term: "Spring Quarter 2026",
            subject: course.department || course.code.split(' ')[0],
            courseNumber: course.code.split(' ')[1],
            courseCode: course.code,
            title: course.title,
            crn: String(crnCounter++),
            section: String(i).padStart(3, '0'),
            units: String(course.units || "4.0"),
            meetings: [
                {
                    days: selectedDays,
                    startTime,
                    endTime,
                    location: LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)]
                }
            ],
            instructors: [instructor],
            modality: "in-person",
            seatsTotal: 100,
            seatsAvailable: Math.floor(Math.random() * 50),
            waitlistTotal: 0,
            waitlistAvailable: 20,
            notes: []
        });
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sections, null, 2));
  console.log(`Generated ${sections.length} sections for ${courses.length} courses.`);
}

generateSections();
