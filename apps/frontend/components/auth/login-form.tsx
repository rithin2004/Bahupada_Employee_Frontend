"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppRole } from "@/lib/navigation";
import { asObject, backendApiBaseUrl, writePortalSession } from "@/lib/backend-api";

type LoginFormProps = {
  role: AppRole;
  title: string;
  description: string;
};

export function LoginForm({ role, title, description }: LoginFormProps) {
  const router = useRouter();
  const dashboardHref = role === "admin" ? "/admin" : "/employee";
  const portal = role === "admin" ? "ADMIN" : "EMPLOYEE";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    if (!identifier.trim() || !password) {
      toast.error("Enter username and password.");
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
          username: identifier.trim(),
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
      toast.success(`${role === "admin" ? "Admin" : "Employee"} login successful.`);
      router.push(dashboardHref);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setSubmitting(false);
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
            <Label htmlFor="identifier">Email / Phone / Username</Label>
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
        </CardContent>
        <CardFooter className="justify-between text-xs text-muted-foreground">
          <Link href="/">Back to Login</Link>
          <span>JWT session enabled</span>
        </CardFooter>
      </Card>
    </div>
  );
}
