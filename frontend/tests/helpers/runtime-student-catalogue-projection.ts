import baseline from "../fixtures/runtime-student-i18n-baseline.json";
import { digest } from "./admin-final-i18n-audit";
import { withoutMetadataAdditions } from "./metadata-catalogue-projection";

const frozenDigests = {
  ar: "bf5a90f5655c56f06f3023d8e1afa3fae3450bda4cf78a0400825c5428ae41c1",
  en: "49e259e9561da3b7d0398406a13ebe230f1103994fe12cc6df7d37ca7f6868c6",
};
const expected = (["ar", "en"] as const).map((locale) => {
  const additions = baseline.catalogues[locale].additions;
  if (digest(JSON.stringify(additions)) !== frozenDigests[locale])
    throw new Error("Changed independently frozen Student guard additions");
  return JSON.stringify(additions);
});

// Project only these two exact paired leaves out of historical catalogue proofs.
export function withoutRuntimeStudentAdditions(value: Record<string, unknown>) {
  withoutMetadataAdditions(value);
  const errors = (
    value.studentWorkspace as {
      coursework: { errors: Record<string, unknown> };
    }
  ).coursework.errors;
  const additions = {
    startBeforeUpload: errors.startBeforeUpload,
    startBeforeSubmit: errors.startBeforeSubmit,
  };
  if (!expected.includes(JSON.stringify(additions)))
    throw new Error("Unverified Student guard additions");
  delete errors.startBeforeUpload;
  delete errors.startBeforeSubmit;
  return value;
}
