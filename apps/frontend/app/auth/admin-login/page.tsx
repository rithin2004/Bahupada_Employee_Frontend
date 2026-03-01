import { LoginForm } from "@/components/auth/login-form";

export default function AdminLoginPage() {
  return (
    <LoginForm
      role="admin"
      title="Admin Login"
      description="Sign in to manage masters, finance, planning, and approvals."
    />
  );
}
