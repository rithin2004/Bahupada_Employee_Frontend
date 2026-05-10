"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppRole, EmployeeRole } from "@/lib/navigation";
import { defaultRouteForAdmin, defaultRouteForEmployee } from "@/lib/navigation";
import { asObject, backendApiBaseUrl, fetchWithPortalAuth, writePortalSession } from "@/lib/backend-api";

type LoginFormProps = {
  role: AppRole;
  title: string;
  description: string;
};

export function LoginForm({ role, title, description }: LoginFormProps) {
  const router = useRouter();
  const portal = role === "admin" ? "ADMIN" : "EMPLOYEE";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState("");

  async function handleLogin() {
    if (!identifier.trim() || !password) {
      toast.error("Enter email or phone and password.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`${backendApiBaseUrl}/auth/login`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password,
          portal,
        }),
      });
      const payload = asObject(await response.json().catch(() => ({})));
      if (!response.ok) {
        const detail = typeof payload.detail === "string" ? payload.detail : `Login failed: ${response.status}`;
        throw new Error(detail);
      }
      writePortalSession({
        portal,
        accessToken: String(payload.access_token ?? ""),
        refreshToken: String(payload.refresh_token ?? ""),
      });
      let landingHref = role === "admin" ? defaultRouteForAdmin() : defaultRouteForEmployee(null);
      const meResponse = await fetchWithPortalAuth("/auth/me", { method: "GET" });
      if (meResponse.ok) {
        const mePayload = asObject(await meResponse.json().catch(() => ({})));
        if (role === "employee") {
          const employeeRole = typeof mePayload.employee_role === "string" ? (mePayload.employee_role as EmployeeRole) : null;
          landingHref = defaultRouteForEmployee(employeeRole);
        } else {
          landingHref = defaultRouteForAdmin(
            asObject(mePayload.admin_permissions) as Record<string, { read?: boolean; write?: boolean }>,
            Boolean(mePayload.is_super_admin)
          );
        }
      }
      toast.success(`${role === "admin" ? "Admin" : "Employee"} login successful.`);
      router.push(landingHref);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    if (!forgotIdentifier.trim()) {
      toast.error("Enter email or phone.");
      return;
    }
    setForgotSubmitting(true);
    try {
      const response = await fetch(`${backendApiBaseUrl}/auth/forgot-password`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier: forgotIdentifier.trim(),
          portal,
        }),
      });
      const payload = asObject(await response.json().catch(() => ({})));
      if (!response.ok) {
        const detail = typeof payload.detail === "string" ? payload.detail : `Request failed: ${response.status}`;
        throw new Error(detail);
      }
      const resetLink = typeof payload.reset_link === "string" ? payload.reset_link : "";
      if (resetLink) {
        router.push(resetLink);
      } else {
        toast.success(typeof payload.message === "string" ? payload.message : "If the account exists, a reset link has been issued.");
      }
      setForgotOpen(false);
      setForgotIdentifier("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Forgot password failed");
    } finally {
      setForgotSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{title}</CardTitle>
            <Badge variant="outline" className="capitalize">
              {role}
            </Badge>
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="identifier">Email / Phone</Label>
            <Input
              id="identifier"
              placeholder="name@company.com"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleLogin();
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="********"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleLogin();
                }
              }}
            />
          </div>
          <Button className="w-full" onClick={() => void handleLogin()} disabled={submitting}>
            {submitting ? "Signing In..." : "Sign In"}
          </Button>
          <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost" className="w-full">
                Forgot Password
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Reset Password</DialogTitle>
                <DialogDescription>Enter the registered email or phone number to create or reset the password.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="forgot-identifier">Email / Phone</Label>
                <Input
                  id="forgot-identifier"
                  value={forgotIdentifier}
                  onChange={(event) => setForgotIdentifier(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void handleForgotPassword();
                    }
                  }}
                />
              </div>
              <DialogFooter>
                <Button onClick={() => void handleForgotPassword()} disabled={forgotSubmitting}>
                  {forgotSubmitting ? "Sending..." : "Continue"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
        <CardFooter className="justify-between text-xs text-muted-foreground">
          <Link href="/">Back to Login</Link>
          <span>JWT session enabled</span>
        </CardFooter>
      </Card>
    </div>
  );
}
