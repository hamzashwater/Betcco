import { AuthPageLayout, RegisterForm } from "@/features/auth/auth-forms";

export default function RegisterPage() {
  return (
    <AuthPageLayout showGalaxy>
      <RegisterForm />
    </AuthPageLayout>
  );
}
