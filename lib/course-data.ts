export interface Course {
  code: string;
  title: string;
  units: number | string;
  description: string;
  prerequisites: string | string[];
  offered: string[];
  ge_areas: string[];
  department?: string;
}

export interface MajorRequirements {
  name: string;
  department: string;
  college: string;
  total_units_required: number;
  major_units_minimum: number;
  gpa_requirement: string;
  preparation_courses: {
    description: string;
    courses: (string | { code: string; title: string })[];
  };
  core_courses?: {
    description: string;
    courses: { code: string; title: string }[];
  };
  upper_division_required?: {
    description: string;
    courses: string[];
  };
  upper_division_electives: {
    description: string;
    choose: number;
    from: string[];
  };
  emphasis_areas: {
    name: string;
    recommended: string[];
  }[];
  general_education: {
    description: string;
    note: string;
  };
  advising_notes: string[];
}

export interface RequirementSection {
  heading: string;
  courses: string[];
  units: string;
  notes: string[];
}

export interface ScrapedProgram {
  name: string;
  url: string;
  degree_type: string;
  department: string;
  description: string;
  requirements: RequirementSection[];
  specializations: string[];
  advising_notes: string[];
  total_units: string;
}

export interface GERequirements {
  title: string;
  effective: string;
  total_units: number;
  categories: {
    name: string;
    units_required: number;
    description: string;
    areas: {
      code: string;
      name: string;
      units_min?: number;
      units_max?: number;
      units_required?: number;
      description: string;
    }[];
  }[];
  notes: string[];
}

export interface EmbeddingEntry {
  id: string;
  text: string;
  embedding: number[];
  metadata: {
    type:
      | "course"
      | "major_overview"
      | "major_requirements"
      | "major_advising"
      | "program_overview"
      | "program_requirements"
      | "program_advising"
      | "ge_requirement";
    source: string;
  };
}

export interface StudentContext {
  major: string;
  year: string;
  completedCourses: string[];
}
