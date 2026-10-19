// Only the separately approved UI-D01-05G helper and its two call sites may
// return to the original complete SiteNavigation source. All other bytes stay.
const helper = [
  "function isTeacherWorkspacePath(pathname: string, locale: string) {",
  "  const sectionRoot = `/${locale}/teacher`;",
  "  return pathname === sectionRoot || pathname.startsWith(`${sectionRoot}/`);",
  "}",
  "",
  "",
].join("\n");
const call = "isTeacherWorkspacePath(pathname, locale)";

export function projectTeacherRouteBoundary(source: string) {
  const original = source.replace(/\r\n/g, "\n");
  if (original.split(helper).length !== 2 || original.split(call).length !== 3)
    return original;
  return original
    .replace(helper, "")
    .split(call)
    .join("pathname.startsWith(`/${locale}/teacher`)");
}
