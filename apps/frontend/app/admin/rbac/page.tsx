import { redirect } from "next/navigation";

export default function LegacyAdminRbacPage() {
  redirect("/admin-access");
}
