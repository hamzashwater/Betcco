import ts from "typescript";

export const teacherFiles = [
  "src/app/[locale]/teacher/[[...segment]]/page.tsx",
  "src/features/teacher/course-editor.tsx",
  "src/features/teacher/course-workspace-navigation.tsx",
  "src/features/teacher/teacher-area.tsx",
  "src/features/teacher/teacher-courses-management.tsx",
  "src/features/teacher/teacher-student-follow-up.tsx",
  "src/features/teacher/practice-presentation.ts",
  "src/features/teacher/file-picker-copy.ts",
  "src/features/learning/learning-aim-practice.tsx",
  "src/features/learning/comprehensive-practice.tsx",
  "src/lib/academic-localization.ts",
  "src/components/forms/file-picker.tsx",
] as const;
export type Classification =
  | "STATIC_UI"
  | "SERVER_BILINGUAL_DATA"
  | "DIRECTION"
  | "MESSAGE_KEY"
  | "TECHNICAL"
  | "PROTOCOL"
  | "COMPATIBILITY_DEFAULT";
export type Candidate = {
  line: number;
  owner: string;
  kind: string;
  text: string;
  classification: Classification;
};
const uiAttributes = new Set([
  "label",
  "title",
  "placeholder",
  "aria-label",
  "helpText",
  "chooseLabel",
  "description",
]);
const safeAttributes = new Set([
  "className",
  "href",
  "src",
  "accept",
  "type",
  "role",
  "dir",
  "target",
  "rel",
  "variant",
  "size",
  "name",
  "id",
  "aria-hidden",
  "aria-busy",
  "aria-live",
  "aria-expanded",
  "aria-current",
  "autoComplete",
  "loading",
  "preload",
  "method",
]);
const technicalText = new Set([
  "BETCCO BTEC",
  "BTEC",
  "BETCCO",
  "LEARN",
  "ASSESS",
  "P",
  "M",
  "D",
  "PDF",
  "DOCX",
  "XLSX",
  "PPTX",
  "PNG",
  "JPG",
  "JPEG",
  "ZIP",
  "TXT",
  "A.P1",
  "JOD",
  "MB",
]);
export function auditTeacherSource(
  path: string,
  source: string,
  academicUnitLabelReachable = false,
  filePickerInjected = false,
) {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const candidates: Candidate[] = [];
  let owner = "module";
  const add = (
    node: ts.Node,
    kind: string,
    text: string,
    classification: Classification,
  ) => {
    if (filePickerInjected && classification === "STATIC_UI") {
      let guarded = owner === "fileType";
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (
          ts.isConditionalExpression(parent) &&
          parent.condition.getText(file) === "copy" &&
          node.pos >= parent.whenFalse.pos &&
          node.end <= parent.whenFalse.end
        )
          guarded = true;
      }
      if (guarded) classification = "COMPATIBILITY_DEFAULT";
    }
    candidates.push({
      line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
      owner,
      kind,
      text,
      classification,
    });
  };
  const isData = (a: ts.Node, b: ts.Node) =>
    ts.isPropertyAccessExpression(a) && ts.isPropertyAccessExpression(b);
  const visit = (node: ts.Node) => {
    if (
      ts.isConditionalExpression(node) &&
      /locale\s*===?\s*["']ar["']|locale\.startsWith\(["']ar["']\)|^isArabic$/.test(
        node.condition.getText(file),
      )
    ) {
      const direction =
        ts.isStringLiteral(node.whenTrue) &&
        node.whenTrue.text === "rtl" &&
        ts.isStringLiteral(node.whenFalse) &&
        node.whenFalse.text === "ltr";
      add(
        node,
        "locale-branch",
        node.getText(file),
        direction
          ? "DIRECTION"
          : isData(node.whenTrue, node.whenFalse) ||
              (path === "src/lib/academic-localization.ts" &&
                owner === "academicText") ||
              (path.includes("/learning/") &&
                owner === "tr" &&
                node.whenTrue.getText(file) === "ar" &&
                node.whenFalse.getText(file) === "en")
            ? "SERVER_BILINGUAL_DATA"
            : "STATIC_UI",
      );
    }
    if (
      ts.isIfStatement(node) &&
      /locale\s*!==?\s*["']ar["']/.test(node.expression.getText(file))
    )
      add(node, "locale-guard", node.expression.getText(file), "STATIC_UI");
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(file) === "tr" &&
      node.arguments.length === 3
    ) {
      add(
        node,
        "bilingual-helper",
        node.getText(file),
        isData(node.arguments[1], node.arguments[2])
          ? "SERVER_BILINGUAL_DATA"
          : "STATIC_UI",
      );
    }
    if (ts.isJsxText(node)) {
      const text = node.text.trim();
      if (text)
        add(
          node,
          "jsx-text",
          text,
          /[A-Za-z\u0600-\u06ff]/u.test(text) && !technicalText.has(text)
            ? "STATIC_UI"
            : "TECHNICAL",
        );
    }
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const text = node.text,
        parent = node.parent;
      let ancestor: ts.Node | undefined = parent;
      let inlineLocaleCopy = false;
      while (ancestor && !ts.isFunctionDeclaration(ancestor)) {
        if (
          ts.isConditionalExpression(ancestor) &&
          ancestor.condition.getText(file) === "isArabic"
        )
          inlineLocaleCopy = true;
        ancestor = ancestor.parent;
      }
      let classification: Classification = "TECHNICAL";
      if (/[\u0600-\u06ff]/u.test(text)) classification = "STATIC_UI";
      else if (
        /[A-Za-z]/.test(text) &&
        !technicalText.has(text) &&
        ((ts.isJsxExpression(parent) && ts.isJsxElement(parent.parent)) ||
          (ts.isTemplateExpression(parent) &&
            ts.isJsxExpression(parent.parent) &&
            ts.isJsxElement(parent.parent.parent)))
      )
        classification = "STATIC_UI";
      else if (inlineLocaleCopy && /[A-Za-z]/.test(text))
        classification = "STATIC_UI";
      else if (
        path === "src/components/forms/file-picker.tsx" &&
        owner === "fileType" &&
        text === "File"
      )
        classification = "STATIC_UI";
      else if (
        ts.isConditionalExpression(parent) &&
        /locale\.startsWith\(["']ar["']\)/.test(
          parent.condition.getText(file),
        ) &&
        node !== parent.condition &&
        /[A-Za-z]/.test(text)
      )
        classification = "STATIC_UI";
      else if (
        ts.isCallExpression(parent) &&
        parent.expression.getText(file) === "tr" &&
        parent.arguments.indexOf(node as ts.Expression) > 0
      )
        classification = "STATIC_UI";
      else if (
        ts.isArrayLiteralExpression(parent) &&
        parent.elements.length === 3 &&
        parent.elements.some(
          (e) => ts.isStringLiteral(e) && /[\u0600-\u06ff]/u.test(e.text),
        ) &&
        parent.elements.indexOf(node as ts.Expression) > 0
      )
        classification = "STATIC_UI";
      else if (
        ts.isCallExpression(parent) &&
        ["t", "access", "useTranslations"].includes(
          parent.expression.getText(file),
        )
      )
        classification = "MESSAGE_KEY";
      else if (
        ts.isJsxAttribute(parent) &&
        uiAttributes.has(parent.name.getText(file)) &&
        /[A-Za-z]/.test(text) &&
        !technicalText.has(text)
      )
        classification = "STATIC_UI";
      else if (
        ts.isJsxAttribute(parent) &&
        safeAttributes.has(parent.name.getText(file))
      )
        classification = "TECHNICAL";
      else if (
        owner === "localizeCourseMessage" ||
        (owner === "RequestError" && text === "Request failed.")
      )
        classification = "PROTOCOL";
      add(node, "literal", text, classification);
    }
    ts.forEachChild(node, visit);
  };
  const teacherSource = file.statements
    .filter(
      (node) =>
        ts.isFunctionDeclaration(node) && node.name?.text.startsWith("Teacher"),
    )
    .map((node) => node.getText(file))
    .join("\n");
  const reachableSharedPresentation = path.endsWith("learning-aim-practice.tsx")
    ? ["tr", "practiceStatus", "trainingOutcomeLabel"]
    : path.endsWith("comprehensive-practice.tsx")
      ? ["tr", "statusLabel", "outcomeLabel"]
      : [];
  for (const node of file.statements) {
    owner = ts.isFunctionDeclaration(node)
      ? (node.name?.text ?? "anonymous")
      : "module";
    if (
      path === "src/lib/academic-localization.ts" &&
      owner !== "academicText" &&
      !(academicUnitLabelReachable && owner === "academicUnitLabel")
    )
      continue;
    // These files contain student and Teacher code. Only the reachable Teacher functions are owned by this cleanup.
    if (
      path.includes("/learning/") &&
      !(ts.isFunctionDeclaration(node) && owner.startsWith("Teacher"))
    ) {
      const name = ts.isFunctionDeclaration(node)
        ? node.name?.text
        : ts.isVariableStatement(node)
          ? node.declarationList.declarations[0]?.name.getText(file)
          : undefined;
      if (
        !name ||
        !reachableSharedPresentation.includes(name) ||
        !new RegExp(`\\b${name}\\(`).test(teacherSource)
      )
        continue;
      owner = name;
    }
    visit(node);
  }
  const count = (classification: Classification, kind?: string) =>
    candidates.filter(
      (c) => c.classification === classification && (!kind || c.kind === kind),
    ).length;
  return {
    path,
    candidates,
    staticArabic: candidates.filter(
      (c) =>
        c.kind === "literal" &&
        c.classification === "STATIC_UI" &&
        /[\u0600-\u06ff]/u.test(c.text),
    ).length,
    staticEnglish: candidates.filter(
      (c) =>
        ["literal", "jsx-text"].includes(c.kind) &&
        c.classification === "STATIC_UI" &&
        /[A-Za-z]/.test(c.text) &&
        !/[\u0600-\u06ff]/u.test(c.text),
    ).length,
    staticLocaleBranches:
      count("STATIC_UI", "locale-branch") + count("STATIC_UI", "locale-guard"),
    staticHelperCalls: count("STATIC_UI", "bilingual-helper"),
    serverBranches: count("SERVER_BILINGUAL_DATA", "locale-branch"),
    serverHelperCalls: count("SERVER_BILINGUAL_DATA", "bilingual-helper"),
    directionBranches: count("DIRECTION", "locale-branch"),
    technicalStrings: count("TECHNICAL", "literal"),
    compatibilityDefaultArabic: candidates.filter(
      (c) =>
        c.kind === "literal" &&
        c.classification === "COMPATIBILITY_DEFAULT" &&
        /[\u0600-\u06ff]/u.test(c.text),
    ).length,
    compatibilityDefaultEnglish: candidates.filter(
      (c) =>
        c.kind === "literal" &&
        c.classification === "COMPATIBILITY_DEFAULT" &&
        /[A-Za-z]/.test(c.text) &&
        !/[\u0600-\u06ff]/u.test(c.text),
    ).length,
    compatibilityDefaultLocaleBranches: count(
      "COMPATIBILITY_DEFAULT",
      "locale-branch",
    ),
  };
}

/** These strings are reviewed as technical, not guessed from their English spelling. Freeze the set so a new candidate requires explicit classification. */
export function reviewedTechnicalCandidates(
  result: ReturnType<typeof auditTeacherSource>,
) {
  return [
    ...new Set(
      result.candidates
        .filter((c) => c.classification === "TECHNICAL" && c.kind === "literal")
        .map((c) => `${c.owner}: ${c.text}`),
    ),
  ].sort();
}
