export type CourseSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  track: string;
  grade?: string;
  specialization?: string;
  subject?: string;
  price: number;
  currency: string;
  isFree: boolean;
  lessonCount: number;
  durationMinutes: number;
  coverImageKey?: string;
  teacherName?: string;
};

export type PagedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
};
export type CourseDetail = {
  course: CourseSummary;
  outcomes: { arabic: string; english: string }[];
  skills: { arabic: string; english: string }[];
  modules: {
    id: string;
    title: string;
    lessons: {
      id: string;
      title: string;
      durationSeconds: number;
      isPreview: boolean;
      type: string;
    }[];
  }[];
};
