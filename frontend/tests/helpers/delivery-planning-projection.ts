import baseline from "../fixtures/ui-d01-15-delivery-planning-baseline.json";
import {
  projectAcademicCatalogBoundary,
  withoutAcademicCatalogAdditions,
} from "./academic-catalog-management-projection";
function reverse(
  source: string,
  seams: { approved: string; previous: string }[],
) {
  const original = source.replace(/\r\n/g, "\n");
  let result = original;
  for (const seam of seams) {
    if (result.split(seam.approved).length !== 2) return original;
    result = result.replace(seam.approved, seam.previous);
  }
  return result;
}
export function projectDeliveryPlanningBoundary(source: string, path: string) {
  source = projectAcademicCatalogBoundary(source, path);
  const key = path.replaceAll("\\", "/");
  if (/(?:^|\/)src\/features\/admin\/delivery-planning\.tsx$/.test(key))
    return reverse(source, baseline.seams);
  const locale = /^messages\/(en|ar)\.json$/.exec(key)?.[1] as
    "en" | "ar" | undefined;
  if (locale) return reverse(source, baseline.messageSeams[locale]);
  const seams = baseline.guardSeams[key as keyof typeof baseline.guardSeams];
  return seams ? reverse(source, seams) : source;
}
export function withoutDeliveryPlanningAdditions(
  value: Record<string, unknown>,
) {
  withoutAcademicCatalogAdditions(value);
  const target = value.deliveryPlanning as Record<string, unknown> | undefined;
  if (
    !target ||
    !Object.keys(baseline.additions.en).some((key) =>
      Object.hasOwn(target, key),
    )
  )
    return value;
  if (
    !Object.values(baseline.additions).some((copy) =>
      Object.entries(copy).every(([key, expected]) => target[key] === expected),
    )
  )
    throw Error("Unverified Delivery Planning presentation copy");
  for (const key of Object.keys(baseline.additions.en)) delete target[key];
  return value;
}
