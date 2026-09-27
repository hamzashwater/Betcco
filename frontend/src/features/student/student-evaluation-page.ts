import { api } from "@/lib/api";
import { useInfiniteQuery } from "@tanstack/react-query";

export type StudentEvaluationPage<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasNextPage: boolean;
};

export function useStudentEvaluations<T>(retry?: boolean) {
  return useInfiniteQuery({
    queryKey: ["evaluations", "mine"],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api<StudentEvaluationPage<T>>(
        `/evaluations/mine?page=${pageParam}&pageSize=20`,
      ),
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    retry,
  });
}
