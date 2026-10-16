import { useEffect, useState } from "react";
import { checkAccountExists } from "@/lib/firebase-otp.functions";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Eye, EyeOff, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FindMitLogo } from "@/components/FindMitLogo";
import { USERNAME_HINT, normalizeUsername, useUsernameCheck } from "@/lib/username";
import { normalizeGhanaPhone } from "@/lib/phone-verify.functions";
import { loginWithIdentifier } from "@/lib/login.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in or register — FindMit" },
      {
        name: "description",
        content:
          "Create your FindMit account with a username, email and password, verified by email, or sign in to continue.",
      },
      { property: "og:title", content: "Sign in or register — FindMit" },
      {
        property: "og:description",
        content:
          "Create your FindMit account with a username, email and password, verified by email, or sign in to continue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "register";
type SignInTab = "email" | "phone";

function PhoneField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex">
      <span className="flex items-center rounded-l-md border border-r-0 border-input bg-secondary px-3 text-sm font-semibold">
        +233
      </span>
      <Input
        id={id}
        inputMode="tel"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d\s]/g, ""))}
        placeholder="24 123 4567"
        className="rounded-l-none"
      />
    </div>
  );
}

function toE164(local: string): string | null {
  const n = normalizeGhanaPhone(local);
  return n ? `+${n}` : null;
}

function AuthPage() {
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [tab, setTab] = useState<SignInTab>("email");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Sign in
  const [identifier, setIdentifier] = useState("");
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register / verify
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);

  const check = useUsernameCheck(username);
  const login = useServerFn(loginWithIdentifier);
  const accountExists = useServerFn(checkAccountExists);

  // Signed in (e.g. new Google user) but no profile and no verified phone yet.
  const needsPhone = false;

  useEffect(() => {
    if (loading || !session || needsPhone) return;
    void navigate({ to: profile ? "/" : "/onboarding", replace: true });
  }, [loading, session, profile, needsPhone, navigate]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);


  const signInGoogle = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error("Could not sign in. Please try again.");
    }
  };

  const doSignIn = async () => {
    const id = tab === "phone" ? loginPhone : identifier;
    if (!id.trim() || !loginPassword) return;
    if (tab === "phone" && !normalizeGhanaPhone(loginPhone)) {
      toast.error("Enter a valid Ghana number, e.g. 24 123 4567.");
      return;
    }
    setBusy(true);
    try {
      const result = await login({ data: { identifier: id, password: loginPassword } });
      if (!result.ok) {
        toast.error(tab === "phone" ? "Wrong number or password." : "Wrong username, email or password.");
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      });
      if (error) throw error;
    } catch (error) {
      console.error(error);
      toast.error("Could not sign you in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const resendEmail = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setResendIn(60);
      toast.success("Email sent again. Check your inbox and spam folder.");
    } catch (error) {
      console.error(error);
      toast.error("Could not resend the email. Please wait and try again.");
    } finally {
      setBusy(false);
    }
  };

  const verifyEmailCode = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code,
        type: "signup",
      });
      if (error) {
        toast.error("That code is not correct or has expired.");
        return;
      }
      toast.success("Email verified. Let's finish your profile.");
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async () => {
    setBusy(true);
    try {
      const exists = await accountExists({ data: { email: email.trim() } });
      if (exists.emailExists) {
        toast.error("Account exists, please login.");
        setMode("signin");
        setTab("email");
        setIdentifier(email.trim());
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { username: normalizeUsername(username) },
        },
      });
      if (error) {
        if (error.message.toLowerCase().includes("registered")) {
          toast.error("Account exists, please login.");
          setMode("signin");
          setTab("email");
          setIdentifier(email.trim());
        } else toast.error("Could not create your account. Please try again.");
        return;
      }
      if (data.session) {
        toast.success("Account created. Let's finish your profile.");
        return;
      }
      setCodeSent(true);
      setCode("");
      setResendIn(60);
      toast.success("Check your email to verify your account.");
    } catch (error) {
      console.error(error);
      toast.error("Could not create your account. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const canRegister =
    check.status === "available" &&
    /\S+@\S+\.\S+/.test(email) &&
    password.length >= 8 &&
    !busy;

  const passwordInput = (id: string, value: string, set: (v: string) => void, ph: string) => (
    <div className="relative">
      <Input
        id={id}
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={(e) => set(e.target.value)}
        className="pr-10"
        placeholder={ph}
      />
      <button
        type="button"
        onClick={() => setShowPassword((v) => !v)}
        aria-label={showPassword ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      >
        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );

  return (
    <main className="flex min-h-screen flex-col bg-background px-6 py-10">
      <div className="mx-auto w-full max-w-sm flex-1">
        <div className="mb-8 flex flex-col items-center text-center">
          <FindMitLogo size="xl" linkToHome={false} className="mx-auto" />
          <p className="mt-3 text-sm font-medium" style={{ color: "#0A4A3A" }}>
            From classrooms to careers across Ghana
          </p>
        </div>

        {true && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
              {(["signin", "register"] as Mode[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={cn(
                    "rounded-lg py-2 text-sm font-semibold transition-colors",
                    mode === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {value === "signin" ? "Sign in" : "Register"}
                </button>
              ))}
            </div>

            {mode === "signin" ? (
              <div className="space-y-4">
                <div className="flex gap-4 border-b border-border">
                  {(["email", "phone"] as SignInTab[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTab(t)}
                      className={cn(
                        "-mb-px border-b-2 pb-2 text-sm font-semibold",
                        tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground",
                      )}
                    >
                      {t === "email" ? "Email" : "Phone"}
                    </button>
                  ))}
                </div>
                {tab === "email" ? (
                  <div className="space-y-2">
                    <Label htmlFor="identifier">Username or email</Label>
                    <Input
                      id="identifier"
                      value={identifier}
                      autoCapitalize="none"
                      autoCorrect="off"
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="kwame or kwame@mail.com"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="login-phone">Phone number</Label>
                    <PhoneField id="login-phone" value={loginPhone} onChange={setLoginPhone} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  {passwordInput("login-password", loginPassword, setLoginPassword, "Your password")}
                </div>
                <Button
                  size="lg"
                  className="h-12 w-full rounded-xl text-base font-semibold"
                  disabled={busy || !(tab === "phone" ? loginPhone : identifier).trim() || !loginPassword}
                  onClick={() => void doSignIn()}
                >
                  {busy ? "Signing you in…" : "Sign in"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <div className="relative">
                    <Input
                      id="username"
                      value={username}
                      maxLength={20}
                      autoCapitalize="none"
                      autoCorrect="off"
                      onChange={(e) => setUsername(e.target.value.toLowerCase())}
                      placeholder="username"
                      className="pr-10"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      {check.status === "checking" ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : check.status === "available" ? (
                        <Check className="size-4 text-success" />
                      ) : check.status === "taken" || check.status === "invalid" ? (
                        <X className="size-4 text-destructive" />
                      ) : null}
                    </span>
                  </div>
                  <p
                    className={
                      check.status === "taken" || check.status === "invalid"
                        ? "text-xs text-destructive"
                        : check.status === "available"
                          ? "text-xs text-success"
                          : "text-xs text-muted-foreground"
                    }
                  >
                    {check.message ?? USERNAME_HINT}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@mail.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  {passwordInput("password", password, setPassword, "At least 8 characters")}
                </div>

                {codeSent ? (
                  <div className="space-y-3 rounded-xl border border-border bg-secondary/50 p-3">
                    <p className="text-sm">
                      We sent a confirmation email to <strong>{email.trim()}</strong>. Tap the link in
                      it, or enter the code from the email below.
                    </p>
                    <Input
                      id="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="Code from email"
                      className="text-center text-lg tracking-[0.3em]"
                    />
                    <Button
                      size="lg"
                      className="h-12 w-full rounded-xl text-base font-semibold"
                      disabled={busy || code.length < 6}
                      onClick={() => void verifyEmailCode()}
                    >
                      {busy ? "Checking…" : "Verify email"}
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full"
                      disabled={busy || resendIn > 0}
                      onClick={() => void resendEmail()}
                    >
                      {resendIn > 0 ? `Resend email in ${resendIn}s` : "Resend email"}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="lg"
                    className="h-12 w-full rounded-xl text-base font-semibold"
                    disabled={!canRegister}
                    onClick={() => void doRegister()}
                  >
                    {busy ? "Creating your account…" : "Create account"}
                  </Button>
                )}
                <p className="text-center text-xs text-muted-foreground">
                  Verification is by email. Your email stays hidden from other people unless you allow it.
                </p>
              </div>
            )}

            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button
              variant="outline"
              size="lg"
              className="h-12 w-full rounded-xl text-base font-semibold"
              onClick={() => void signInGoogle()}
              disabled={busy}
            >
              Continue with Google
            </Button>
          </>
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground">
          By continuing you agree to keep FindMit a respectful place.
        </p>
      </div>
    </main>
  );
}
