import {
  AuthPageLayout,
  EmailConfirmationForm,
} from "@/features/auth/auth-forms";

export default function ConfirmEmailPage() {
  return (
    <AuthPageLayout>
      <EmailConfirmationForm />
    </AuthPageLayout>
  );
}
