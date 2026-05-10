import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-4xl space-y-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Bahu ERP</p>
          <h1 className="text-2xl font-semibold tracking-tight">Choose Login Portal</h1>
          <p className="text-sm text-muted-foreground">Use the right portal to sign in with the registered email or phone number.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Admin Portal</CardTitle>
                <Badge>Admin</Badge>
              </div>
              <CardDescription>Masters, approvals, finance, planning, and full operations control.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild className="w-full">
                <Link href="/auth/admin-login">Go to Admin Login</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Employee Portal</CardTitle>
                <Badge variant="secondary">Employee</Badge>
              </div>
              <CardDescription>Packing, delivery, and role-specific daily workflows.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild className="w-full">
                <Link href="/auth/employee-login">Go to Employee Login</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
