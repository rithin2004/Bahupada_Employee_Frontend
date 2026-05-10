"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { asObject, backendApiBaseUrl } from "@/lib/backend-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const portal = (searchParams.get("portal") ?? "EMPLOYEE").toUpperCase();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!token) {
      toast.error("Reset token is missing.");
      return;
    }
    if (!password || password !== confirmPassword) {
      toast.error("Passwords must match.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`${backendApiBaseUrl}/auth/reset-password`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reset_token: token,
          new_password: password,
        }),
      });
      const payload = asObject(await response.json().catch(() => ({})));
      if (!response.ok) {
        const detail = typeof payload.detail === "string" ? payload.detail : `Reset failed: ${response.status}`;
        throw new Error(detail);
      }
      toast.success(typeof payload.message === "string" ? payload.message : "Password reset successful.");
      router.replace(portal === "ADMIN" ? "/auth/admin-login" : "/auth/employee-login");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reset failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set Password</CardTitle>
          <CardDescription>Create or reset the account password.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleSubmit();
                }
              }}
            />
          </div>
          <Button className="w-full" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "Saving..." : "Save Password"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
