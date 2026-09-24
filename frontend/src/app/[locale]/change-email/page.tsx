import { AuthPageLayout } from "@/features/auth/auth-forms";
import { EmailChangeConfirmation } from "@/features/auth/email-change-confirmation";

export default function ChangeEmailPage() {
  return (
    <AuthPageLayout>
      <EmailChangeConfirmation />
    </AuthPageLayout>
  );
}
