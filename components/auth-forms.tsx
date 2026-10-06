"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { forgotAction, joinByInviteAction, loginAction, resetAction, signUpAction, type FormState } from "@/app/actions";
import { Button, Field, inputClass } from "./ui";

function Submit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {children}
    </Button>
  );
}

function Message({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-sm font-semibold text-danger">{state.error}</p>;
  if (state.done) return <p role="status" className="rounded-2xl bg-accent-soft px-4 py-3 text-sm font-semibold text-accent">{state.done}</p>;
  return null;
}

function EmailField({ state }: { state: FormState }) {
  return (
    <Field label="Email">
      <input name="email" type="email" required autoComplete="email" inputMode="email" defaultValue={state.values?.email} className={inputClass} />
    </Field>
  );
}

function PasswordField({ label = "Password", isNew }: { label?: string; isNew?: boolean }) {
  return (
    <Field label={label} hint={isNew ? "At least 8 characters." : undefined}>
      <input
        name="password"
        type="password"
        required
        minLength={isNew ? 8 : undefined}
        maxLength={128}
        autoComplete={isNew ? "new-password" : "current-password"}
        className={inputClass}
      />
    </Field>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      <EmailField state={state} />
      <PasswordField />
      <Message state={state} />
      <Submit>Sign in</Submit>
      <p className="text-center text-sm">
        <Link href="/forgot" className="inline-block py-2 font-semibold text-accent">
          Forgot password?
        </Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const [state, action] = useActionState(signUpAction, {});
  if (state.done) return <Message state={state} />;
  return (
    <form action={action} className="space-y-4">
      <Field label="Name">
        <input name="name" required maxLength={60} autoComplete="name" defaultValue={state.values?.name} className={inputClass} />
      </Field>
      <EmailField state={state} />
      <PasswordField isNew />
      <Message state={state} />
      <Submit>Create account</Submit>
    </form>
  );
}

/** Create an account straight from an invitation: the email is fixed, because the link was sent to it. */
export function JoinForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState(joinByInviteAction, {});
  if (state.done) return <Message state={state} />;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Email">
        <input value={email} readOnly className={inputClass + " text-muted"} />
      </Field>
      <Field label="Your name">
        <input name="name" required maxLength={60} autoComplete="name" defaultValue={state.values?.name} className={inputClass} />
      </Field>
      <PasswordField isNew />
      <Message state={state} />
      <Submit>Create account and accept</Submit>
    </form>
  );
}

export function ForgotForm() {
  const [state, action] = useActionState(forgotAction, {});
  if (state.done) return <Message state={state} />;
  return (
    <form action={action} className="space-y-4">
      <EmailField state={state} />
      <Message state={state} />
      <Submit>Send reset link</Submit>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <PasswordField label="New password" isNew />
      <Message state={state} />
      <Submit>Save password</Submit>
    </form>
  );
}
