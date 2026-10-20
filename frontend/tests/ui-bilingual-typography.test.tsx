import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, test } from "vitest";
import { Action } from "@/components/ui/action";
import { QueryState } from "@/components/ui/query-state";
import baseline from "./fixtures/ui-d01-03-baseline.json";
import { brandTokens, globals, tokensFor } from "./helpers/ui-color-roles";
import { syntax, typographyContract } from "./helpers/ui-typography-contract";
import { projectRoleShellSource } from "./helpers/role-shell-projection";

afterEach(cleanup);

describe("bounded bilingual typography delivery", () => {
  test("serves only the approved normal faces locally with licenses and immutable source hashes", () => {
    const manifest = JSON.parse(
      readFileSync("public/fonts/sources.json", "utf8"),
    ) as {
      interCommit: string;
      plexCommit: string;
      files: { file: string; bytes: number; sha256: string }[];
    };
    expect(manifest.interCommit).toMatch(/^[a-f\d]{40}$/);
    expect(manifest.plexCommit).toMatch(/^[a-f\d]{40}$/);
    const faces = [...brandTokens.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(
      (match) => match[1],
    );
    expect(faces).toHaveLength(5);
    for (const face of faces) {
      expect(face).toContain("font-display: optional");
      expect(face).toContain("font-style: normal");
      expect(face).not.toMatch(/https?:|font-weight:\s*[89]00/);
      const url = face.match(/url\("([^"]+)"\)/)?.[1];
      expect(url).toMatch(/^\/fonts\/.+\.woff2$/);
      expect(existsSync(`public${url}`)).toBe(true);
    }
    expect(
      faces.filter((face) => face.includes('font-family: "Inter"'))[0],
    ).toContain("font-weight: 400 700");
    expect(
      faces
        .filter((face) => face.includes('font-family: "IBM Plex Sans Arabic"'))
        .map((face) => face.match(/font-weight:\s*(\d+)/)?.[1])
        .sort(),
    ).toEqual(["400", "500", "600", "700"]);
    for (const file of manifest.files) {
      const bytes = readFileSync(`public/fonts/${file.file}`);
      expect(bytes.length, file.file).toBe(file.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"), file.file).toBe(
        file.sha256,
      );
      if (file.file.endsWith(".woff2"))
        expect(bytes.subarray(0, 4).toString()).toBe("wOF2");
    }
    for (const directory of ["inter", "ibm-plex-sans-arabic"])
      expect(
        readFileSync(`public/fonts/${directory}/OFL.txt`, "utf8"),
      ).toContain("SIL Open Font License, Version 1.1");
  });

  test.each(["light", "dark"] as const)(
    "preserves every merged non-typography semantic/compatibility value (%s)",
    (theme) => {
      const { values } = tokensFor(theme);
      for (const [name, value] of Object.entries(
        baseline.compatibilityTokens[theme],
      ))
        expect(values.get(name), name).toBe(value);
    },
  );

  test("keeps the root layouts, #191 consumers and #190 manifests byte-identical outside exact role-shell presentation seams", () => {
    for (const [file, hash] of Object.entries(baseline.protectedFiles))
      expect(
        createHash("sha256")
          .update(projectRoleShellSource(readFileSync(file, "utf8"), file))
          .digest("hex"),
        file,
      ).toBe(hash);
    expect(globals).toContain("font-family: var(--font-sans)");
    expect(globals).toContain("--ui-font-body: var(--betcco-font-en)");
  });

  test("implements the locked role scale with one locale-aware class family", () => {
    const en = globals.match(/:lang\(en\)\s*\{([^}]+)\}/)?.[1] ?? "";
    const ar = globals.match(/:lang\(ar\)\s*\{([^}]+)\}/)?.[1] ?? "";
    const roles = {
      display: [56, 64, 48, 72, 700],
      page: [28, 36, 28, 42, 700],
      section: [20, 28, 20, 32, 600],
      item: [16, 24, 17, 28, 600],
      body: [16, 26, 16, 29, 400],
      label: [14, 22, 15, 26, 500],
      meta: [12, 18, 13, 22, 400],
      data: [14, 22, 15, 26, 400],
    };
    for (const [
      role,
      [enSize, enLine, arSize, arLine, weight],
    ] of Object.entries(roles)) {
      expect(en).toContain(`--ui-type-${role}-size: ${enSize}px`);
      expect(en).toContain(`--ui-type-${role}-line: ${enLine}px`);
      expect(ar).toContain(`--ui-type-${role}-size: ${arSize}px`);
      expect(ar).toContain(`--ui-type-${role}-line: ${arLine}px`);
      const rule = [
        ...globals.matchAll(
          new RegExp(`\\.ui-type-${role} \\{([^}]+)\\}`, "g"),
        ),
      ]
        .map((match) => match[1])
        .find((block) => block.includes("font-size:"));
      expect(rule).toContain(`font-weight: ${weight}`);
    }
    const mobile = globals.split("@media (max-width: 767px)").at(-1)!;
    for (const declaration of [
      "--ui-type-display-size: 32px",
      "--ui-type-display-size: 30px",
      "--ui-type-page-line: 32px",
      "--ui-type-page-line: 38px",
    ])
      expect(mobile).toContain(declaration);
    expect(globals).toContain("font-synthesis: none");
    expect(globals).toContain(".ui-type-data:lang(en)");
    expect(globals).toContain(".ui-type-data:lang(ar)");
  });
});

describe("complete primitive contract retained after exact typography seams", () => {
  it.each(["action.tsx", "query-state.tsx"] as const)(
    "preserves all non-typography syntax in %s",
    (file) => {
      expect(
        typographyContract(
          readFileSync(`src/components/ui/${file}`, "utf8"),
          file,
        ),
      ).toBe(syntax(baseline.sources[file]));
    },
  );

  it.each([
    ["action.tsx", "disabled={disabled || pending}", "disabled={disabled}"],
    [
      "action.tsx",
      'aria-busy={pending || props["aria-busy"]}',
      "aria-busy={false}",
    ],
    [
      "query-state.tsx",
      'kind === "error" ? "alert"',
      'kind === "error" ? "status"',
    ],
    [
      "query-state.tsx",
      'kind === "loading" ? true',
      'kind === "loading" ? false',
    ],
    ["query-state.tsx", "{description}", '"Replaced raw error"'],
  ] as const)(
    "still detects non-typography drift in %s at %s",
    (file, from, to) => {
      const source = readFileSync(`src/components/ui/${file}`, "utf8");
      expect(source).toContain(from);
      expect(typographyContract(source.replace(from, to), file)).not.toBe(
        syntax(baseline.sources[file]),
      );
    },
  );

  it.each(["en", "ar"] as const)(
    "keeps native pending, error and raw caller content contracts (%s)",
    (locale) => {
      render(
        <div lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
          <Action pending pendingLabel="RAW pending جارٍ الحفظ">
            RAW original
          </Action>
          <QueryState
            kind="error"
            title="RAW error خطأ"
            description="RAW server explanation شرح الخادم"
          />
        </div>,
      );
      const pending = screen.getByRole("button", {
        name: "RAW pending جارٍ الحفظ",
      });
      expect(pending).toBeDisabled();
      expect(pending).toHaveAttribute("aria-busy", "true");
      expect(pending).toHaveClass("ui-type-label");
      expect(screen.getByRole("alert")).toHaveTextContent(
        "RAW server explanation شرح الخادم",
      );
      expect(screen.getByText("RAW error خطأ")).toHaveClass("ui-type-label");
    },
  );
});
