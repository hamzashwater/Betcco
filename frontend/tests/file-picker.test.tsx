import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilePicker } from "@/components/forms/file-picker";

afterEach(cleanup);

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
