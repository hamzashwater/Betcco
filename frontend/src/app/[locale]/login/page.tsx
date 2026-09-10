import { AuthPageLayout, LoginForm } from "@/features/auth/auth-forms";

export default function LoginPage() {
  return (
    <AuthPageLayout showGalaxy>
      <LoginForm />
    </AuthPageLayout>
  );
}
