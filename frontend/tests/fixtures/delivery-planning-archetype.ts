// Synthetic academic facts only — MOCKED UI-CONTRACT EVIDENCE.
export const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export type Year = {
  id: string;
  code: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};
export type Term = Year & { academicYearId: string; sortOrder: number };
export type Version = {
  id: string;
  qualificationCode: string;
  versionCode: string;
  isActive: boolean;
  specializationId?: string;
  specializationEnglishName?: string;
  specializationArabicName?: string;
  qualificationEnglishName?: string;
  qualificationArabicName?: string;
};
export type Summary = {
  id: string;
  qualificationVersionId: string;
  qualificationCode: string;
  qualificationVersionCode: string;
  academicYearId: string;
  academicYearCode: string;
  isActive: boolean;
  entryCount: number;
  gradeId?: string;
  gradeEnglishName?: string;
  gradeArabicName?: string;
  qualificationEnglishName?: string;
  qualificationArabicName?: string;
};
export type Entry = {
  id: string;
  unitDefinitionId: string;
  unitCode: string;
  unitArabicTitle: string;
  unitEnglishTitle: string;
  academicTermId: string;
  termCode: string;
  sortOrder: number;
};
export type Plan = { plan: Summary; entries: Entry[] };
export type Unit = {
  id: string;
  code: string;
  arabicTitle: string;
  englishTitle: string;
  isActive: boolean;
};
export const page = <T>(items: T[], totalCount = items.length) => ({
  items,
  page: 1,
  pageSize: 100,
  totalCount,
});
export const years: Year[] = [
  {
    id: id(101),
    code: "RAW-AY-2026",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    isActive: true,
  },
  {
    id: id(102),
    code: "RAW-AY-2027",
    startDate: "2027-01-01",
    endDate: "2027-12-31",
    isActive: true,
  },
  {
    id: id(103),
    code: "RAW-AY-INACTIVE",
    startDate: "2025-01-01",
    endDate: "2025-12-31",
    isActive: false,
  },
];
export const terms: Term[] = [
  {
    ...years[0],
    id: id(201),
    academicYearId: years[0].id,
    code: "RAW-TERM-INACTIVE",
    sortOrder: 10,
    isActive: false,
    startDate: "2026-01-01",
    endDate: "2026-01-31",
  },
  {
    ...years[0],
    id: id(202),
    academicYearId: years[0].id,
    code: "RAW-TERM-A",
    sortOrder: 20,
    startDate: "2026-02-01",
    endDate: "2026-06-30",
  },
  {
    ...years[0],
    id: id(203),
    academicYearId: years[0].id,
    code: "RAW-TERM-B",
    sortOrder: 30,
    startDate: "2026-07-01",
    endDate: "2026-12-31",
  },
];
export const versions: Version[] = [
  {
    id: id(301),
    qualificationCode: "RAW-Q-IT",
    versionCode: "RAW-V-ONE",
    isActive: true,
    specializationId: id(401),
    specializationEnglishName: "RAW Information Technology",
    specializationArabicName: "تقنية معلومات خام",
    qualificationEnglishName: "RAW Information Technology Qualification",
    qualificationArabicName: "مؤهل تقنية معلومات خام",
  },
  {
    id: id(302),
    qualificationCode: "RAW-Q-ENG",
    versionCode: "RAW-V-TWO",
    isActive: true,
    specializationId: id(402),
    specializationEnglishName: "RAW Engineering",
    specializationArabicName: "هندسة خام",
    qualificationEnglishName: "RAW Engineering Qualification",
    qualificationArabicName: "مؤهل هندسة خام",
  },
  {
    id: id(303),
    qualificationCode: "RAW-INACTIVE",
    versionCode: "RAW-INACTIVE",
    isActive: false,
    specializationId: id(401),
  },
  {
    id: id(304),
    qualificationCode: "RAW-NO-SPEC",
    versionCode: "RAW-NO-SPEC",
    isActive: true,
  },
];
export const grades = [
  {
    id: id(501),
    learningTrackId: id(901),
    englishName: "RAW Grade11",
    arabicName: "صف11 خام",
    isVisible: true,
  },
  {
    id: id(502),
    learningTrackId: id(901),
    englishName: "RAW Grade12",
    arabicName: "صف12 خام",
    isVisible: true,
  },
  {
    id: id(503),
    learningTrackId: id(902),
    englishName: "RAW Other-track Grade",
    arabicName: "صف لمسار آخر",
    isVisible: true,
  },
  {
    id: id(504),
    learningTrackId: id(901),
    englishName: "RAW Hidden Grade",
    arabicName: "صف مخفي",
    isVisible: false,
  },
];
export const specializations = [
  { id: id(401), learningTrackId: id(901), isVisible: true },
  { id: id(402), learningTrackId: id(902), isVisible: true },
];
export const units: Unit[] = Array.from({ length: 7 }, (_, i) => ({
  id: id(601 + i),
  code: `RAW-U${i + 1}`,
  englishTitle: `RAW canonical Unit ${i + 1}`,
  arabicTitle: `وحدة مرجعية خام ${i + 1}`,
  isActive: i !== 3,
}));
export const entries: Entry[] = units.slice(0, 3).map((u, i) => ({
  id: id(801 + i),
  unitDefinitionId: u.id,
  unitCode: u.code,
  unitEnglishTitle: u.englishTitle,
  unitArabicTitle: u.arabicTitle,
  academicTermId: terms[i === 2 ? 2 : 1].id,
  termCode: terms[i === 2 ? 2 : 1].code,
  sortOrder: (i + 1) * 10,
}));
export const summary: Summary = {
  id: id(701),
  qualificationVersionId: versions[0].id,
  qualificationCode: versions[0].qualificationCode,
  qualificationVersionCode: versions[0].versionCode,
  academicYearId: years[0].id,
  academicYearCode: years[0].code,
  isActive: true,
  entryCount: entries.length,
  gradeId: grades[0].id,
  gradeEnglishName: grades[0].englishName,
  gradeArabicName: grades[0].arabicName,
  qualificationEnglishName: versions[0].qualificationEnglishName,
  qualificationArabicName: versions[0].qualificationArabicName,
};
export const plan: Plan = { plan: summary, entries };
export const inactivePlan: Plan = {
  plan: {
    ...summary,
    id: id(702),
    isActive: false,
    entryCount: 1,
    gradeId: grades[1].id,
    gradeEnglishName: grades[1].englishName,
    gradeArabicName: grades[1].arabicName,
  },
  entries: [
    {
      ...entries[0],
      id: id(811),
      academicTermId: terms[0].id,
      termCode: terms[0].code,
    },
  ],
};
export const emptyPlan: Plan = {
  plan: {
    ...summary,
    id: id(703),
    academicYearId: years[1].id,
    academicYearCode: years[1].code,
    entryCount: 0,
  },
  entries: [],
};
export const longEnglish =
  "RAW academic qualification and detailed delivery context ".repeat(5);
export const longArabic =
  "مؤهل أكاديمي خام طويل لتوضيح سياق التخطيط والتسليم ".repeat(5);

export const prefix = "/admin/delivery-planning";
export function fixtureState() {
  return structuredClone({
    years,
    versions,
    grades,
    specializations,
    terms: {
      [years[0].id]: terms,
      [years[1].id]: [],
      [years[2].id]: [],
    } as Record<string, Term[]>,
    plans: {
      [years[0].id]: [summary, inactivePlan.plan],
      [years[1].id]: [emptyPlan.plan],
      [years[2].id]: [],
    } as Record<string, Summary[]>,
    detail: {
      [summary.id]: plan,
      [inactivePlan.plan.id]: inactivePlan,
      [emptyPlan.plan.id]: emptyPlan,
    } as Record<string, Plan>,
    units: { [versions[0].id]: units, [versions[1].id]: [] } as Record<
      string,
      Unit[]
    >,
  });
}
// Exact canned reads only; this fixture does not implement academic policy.
export function fixtureRead(
  state: ReturnType<typeof fixtureState>,
  path: string,
): unknown {
  if (path === `${prefix}/academic-years?pageSize=100`)
    return page(state.years);
  if (path === `${prefix}/qualification-versions?pageSize=100`)
    return page(state.versions);
  if (path === "/admin/academic-taxonomy/grades") return state.grades;
  if (path === "/admin/academic-taxonomy/specializations")
    return state.specializations;
  for (const [year, rows] of Object.entries(state.terms))
    if (path === `${prefix}/academic-years/${year}/terms?pageSize=100`)
      return page(rows);
  for (const [year, rows] of Object.entries(state.plans))
    if (path === `${prefix}/plans?academicYearId=${year}&pageSize=100`)
      return page(rows);
  for (const [planId, value] of Object.entries(state.detail))
    if (path === `${prefix}/plans/${planId}`) return value;
  for (const [version, rows] of Object.entries(state.units))
    if (
      path === `${prefix}/qualification-versions/${version}/units?pageSize=100`
    )
      return page(rows);
  throw new Error(`Unexpected Delivery Planning read: ${path}`);
}
