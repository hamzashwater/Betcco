import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { FilePicker } from "@/components/forms/file-picker";

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
