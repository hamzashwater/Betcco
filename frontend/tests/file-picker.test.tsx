import {
  cleanup,
  fireEvent,
  render as renderRaw,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FilePicker,
  type FilePickerCopy,
} from "@/components/forms/file-picker";

afterEach(cleanup);

function render(node: ReactElement<{ locale?: string }>) {
  const locale = node.props.locale ?? "ar";
  return renderRaw(node, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? ar : en}
      >
        {children}
      </NextIntlClientProvider>
    ),
  });
}

function FilePickerHarness() {
  const [files, setFiles] = useState<File[]>([]);

  return (
    <FilePicker
      label="ملفات المهمة"
      files={files}
      onFilesChange={setFiles}
      locale="ar"
      multiple
      maxFileBytes={100 * 1024 * 1024}
    />
  );
}

describe("FilePicker", () => {
  it.each(["ar", "en"])("preserves exact default copy in %s", (locale) => {
    const arabic = locale === "ar";
    const props = {
      label: "Evidence",
      locale,
      files: [] as File[],
      onFilesChange: vi.fn(),
      maxFileBytes: 2,
    };
    const { rerender } = render(<FilePicker {...props} />);
    expect(
      screen.getByText(
        arabic ? "لم يتم اختيار ملفات بعد" : "No files selected yet",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: arabic ? "اختيار ملف" : "Choose file",
      }),
    ).toBeVisible();
    expect(
      screen.getByLabelText(arabic ? "اختيار Evidence" : "Choose Evidence"),
    ).toBeVisible();
    const file = new File(["ok"], "report.pdf");
    rerender(<FilePicker {...props} files={[file]} multiple />);
    expect(
      screen.getByText(arabic ? "ملف واحد مختار" : "1 file selected"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: arabic ? "اختيار ملفات" : "Choose files",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("list", {
        name: arabic ? "الملفات المختارة" : "Selected files",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: arabic ? "إزالة الملف report.pdf" : "Remove report.pdf",
      }),
    ).toBeVisible();
    rerender(
      <FilePicker
        {...props}
        files={[file, new File(["ok"], "second.pdf")]}
        multiple
      />,
    );
    expect(
      screen.getByText(arabic ? "2 ملفات مختارة" : "2 files selected"),
    ).toBeVisible();
    fireEvent.change(
      screen.getByLabelText(arabic ? "اختيار Evidence" : "Choose Evidence"),
      { target: { files: [new File(["large"], "large.pdf")] } },
    );
    expect(screen.getByRole("alert").textContent).toBe(
      arabic
        ? "الملف «large.pdf» أكبر من الحد المسموح: 0.00 MB لكل ملف."
        : "“large.pdf” exceeds the 0.00 MB limit per file.",
    );
  });

  it.each([1, 2])(
    "renders injected copy and ARIA for %s selected files independently of locale",
    (count) => {
      const files = Array.from(
        { length: count },
        (_, i) => new File(["ok"], `report${i}.pdf`),
      );
      const { rerender } = render(
        <FilePicker
          label="Evidence"
          locale="ar"
          files={[]}
          onFilesChange={vi.fn()}
          copy={injectedCopy}
        />,
      );
      expect(screen.getByText("INJECTED empty")).toBeVisible();
      expect(
        screen.getByRole("button", { name: "INJECTED choose one" }),
      ).toBeVisible();
      rerender(
        <FilePicker
          label="Evidence"
          locale="ar"
          files={files}
          onFilesChange={vi.fn()}
          copy={injectedCopy}
          multiple
        />,
      );
      expect(screen.getByText(`INJECTED selected ${count}`)).toBeVisible();
      expect(
        screen.getByRole("button", { name: "INJECTED choose many" }),
      ).toBeVisible();
      expect(
        screen.getByRole("list", { name: "INJECTED files" }),
      ).toBeVisible();
      expect(screen.getByLabelText("INJECTED input Evidence")).toBeVisible();
      expect(
        screen.getByRole("button", { name: "INJECTED remove report0.pdf" }),
      ).toBeVisible();
      expect(screen.queryByText("ملف واحد مختار")).not.toBeInTheDocument();
    },
  );

  it("keeps explicit chooseLabel precedence, including empty text, with or without injected copy", () => {
    const props = {
      label: "Evidence",
      locale: "en",
      files: [],
      onFilesChange: vi.fn(),
    };
    const { rerender } = render(<FilePicker {...props} />);
    for (const copy of [undefined, injectedCopy]) {
      for (const chooseLabel of ["Explicit override", ""]) {
        rerender(
          <FilePicker {...props} copy={copy} chooseLabel={chooseLabel} />,
        );
        expect(screen.getByRole("button").textContent).toBe(chooseLabel);
      }
    }
  });

  it("uses injected size errors, preserves selected files and resets the native input", async () => {
    const onFilesChange = vi.fn();
    render(
      <FilePicker
        label="Evidence"
        locale="ar"
        files={[new File(["ok"], "existing.pdf")]}
        onFilesChange={onFilesChange}
        maxFileBytes={2}
        helpText="Guidance"
        copy={injectedCopy}
      />,
    );
    const input = screen.getByLabelText(
      "INJECTED input Evidence",
    ) as HTMLInputElement;
    await userEvent.upload(input, new File(["large"], "large.pdf"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "INJECTED oversized large.pdf 0.00 MB",
    );
    expect(input.value).toBe("");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Guidance.*INJECTED oversized/);
    expect(screen.getByText("existing.pdf")).toBeVisible();
    expect(onFilesChange).not.toHaveBeenCalled();
    await userEvent.upload(input, new File(["ok"], "small.pdf"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(onFilesChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: "small.pdf" }),
    ]);
  });

  it.each([false, true])(
    "preserves single slicing / multiple duplicate filtering with injected copy (multiple=%s)",
    (multiple) => {
      const first = new File(["ok"], "first.pdf", { lastModified: 123 });
      const duplicate = new File(["ok"], "first.pdf", { lastModified: 123 });
      const second = new File(["ok"], "second.pdf");
      const onFilesChange = vi.fn();
      render(
        <FilePicker
          label="Evidence"
          locale="ar"
          files={[first]}
          onFilesChange={onFilesChange}
          copy={injectedCopy}
          multiple={multiple}
        />,
      );
      fireEvent.change(screen.getByLabelText("INJECTED input Evidence"), {
        target: { files: [duplicate, second] },
      });
      expect(onFilesChange).toHaveBeenCalledWith(
        multiple ? [first, second] : [duplicate],
      );
    },
  );

  it("resets the input when the last injected-copy file is removed and preserves raw type/size formatting", async () => {
    function Harness() {
      const [files, setFiles] = useState<File[]>([]);
      return (
        <FilePicker
          label="Evidence"
          locale="en"
          files={files}
          onFilesChange={setFiles}
          copy={injectedCopy}
        />
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText(
      "INJECTED input Evidence",
    ) as HTMLInputElement;
    await userEvent.upload(input, new File(["ok"], "report.pdf"));
    expect(input.value).not.toBe("");
    expect(screen.getByText("PDF · 0.00 MB")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "INJECTED remove report.pdf" }),
    );
    expect(input.value).toBe("");
    expect(screen.getByText("INJECTED empty")).toBeVisible();
  });

  it("can present the generic file type through injected copy without changing fileType", () => {
    render(
      <FilePicker
        label="Evidence"
        locale="ar"
        files={[new File(["ok"], "")]}
        onFilesChange={vi.fn()}
        copy={{
          ...injectedCopy,
          typeLabel: (value) => `INJECTED type ${value}`,
        }}
      />,
    );
    expect(screen.getByText("INJECTED type File · 0.00 MB")).toBeVisible();
  });
  it("connects size errors and guidance to the native input and preserves selection", async () => {
    const onFilesChange = vi.fn();
    const selected = new File(["ok"], "existing.pdf");
    render(
      <FilePicker
        label="Evidence"
        locale="en"
        files={[selected]}
        onFilesChange={onFilesChange}
        maxFileBytes={2}
        helpText="Maximum 2 bytes"
      />,
    );
    const input = screen.getByLabelText("Choose Evidence");
    await userEvent.upload(input, new File(["too big"], "large.pdf"));
    expect(screen.getByRole("alert")).toHaveTextContent("large.pdf");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Maximum 2 bytes.*large.pdf/);
    expect(screen.getByText("existing.pdf")).toBeVisible();
    expect(onFilesChange).not.toHaveBeenCalled();
    await userEvent.upload(input, new File(["ok"], "small.pdf"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(onFilesChange).toHaveBeenCalledOnce();
  });

  it("preserves accepted types, single selection and disabled choosing", () => {
    render(
      <FilePicker
        label="Evidence"
        locale="en"
        files={[]}
        onFilesChange={vi.fn()}
        accept=".pdf"
        disabled
      />,
    );
    const input = screen.getByLabelText("Choose Evidence");
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("accept", ".pdf");
    expect(input).not.toHaveAttribute("multiple");
    expect(screen.getByRole("button", { name: "Choose file" })).toBeDisabled();
  });

  it("does not duplicate a file already selected in multiple mode", async () => {
    render(<FilePickerHarness />);
    const file = new File(["assignment"], "report.pdf", {
      type: "application/pdf",
    });
    const input = screen.getByLabelText("اختيار ملفات المهمة");
    await userEvent.upload(input, file);
    await userEvent.upload(input, [file, new File(["image"], "diagram.png")]);
    expect(screen.getAllByText("report.pdf")).toHaveLength(1);
    expect(screen.getByText("2 ملفات مختارة")).toBeVisible();
  });
  it("shows selected file count and details, then lets the user remove a file", async () => {
    const user = userEvent.setup();
    render(<FilePickerHarness />);

    const firstFile = new File(["assignment"], "report.pdf", {
      type: "application/pdf",
    });
    const secondFile = new File(["image"], "diagram.png", {
      type: "image/png",
    });

    await user.upload(screen.getByLabelText("اختيار ملفات المهمة"), [
      firstFile,
      secondFile,
    ]);

    expect(screen.getByText("2 ملفات مختارة")).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("diagram.png")).toBeInTheDocument();
    expect(screen.getByText(/PDF/)).toBeInTheDocument();
    expect(screen.getByText(/PNG/)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "إزالة الملف report.pdf" }),
    );

    expect(screen.getByText("ملف واحد مختار")).toBeInTheDocument();
    expect(screen.queryByText("report.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("diagram.png")).toBeInTheDocument();
  });
});

const injectedCopy: FilePickerCopy = {
  noFilesSelected: "INJECTED empty",
  selectionStatus: (count) => `INJECTED selected ${count}`,
  chooseFile: "INJECTED choose one",
  chooseFiles: "INJECTED choose many",
  selectedFiles: "INJECTED files",
  inputLabel: (label) => `INJECTED input ${label}`,
  removeFile: (fileName) => `INJECTED remove ${fileName}`,
  oversizedFile: (fileName, limit) => `INJECTED oversized ${fileName} ${limit}`,
  typeLabel: (value) => value,
};
