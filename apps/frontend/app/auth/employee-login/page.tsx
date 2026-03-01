import { LoginForm } from "@/components/auth/login-form";

export default function EmployeeLoginPage() {
  return (
    <LoginForm
      role="employee"
      title="Employee Login"
      description="Sign in to process assigned operations, packing, and delivery work."
    />
  );
}
