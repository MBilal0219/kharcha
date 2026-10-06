"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError, type CredentialsSignin } from "next-auth";
import { googleEnabled, signIn, signOut } from "@/lib/auth/config";
import { currentUser } from "@/lib/auth/require-user";
import { EmailInput, ResetInput, SignupInput, completeReset, revokeSessions, startReset, startSignup } from "@/lib/server/accounts";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";

export interface FormState {
  error?: string;
  done?: string;
  values?: { name?: string; email?: string }; // what to put back in the form after an error
}

const field = (form: FormData, name: string) => String(form.get(name) ?? "");
const TOO_MANY = "Too many tries. Wait a while, then try again.";

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function signOutEverywhereAction() {
  const user = await currentUser();
  if (user) await revokeSessions(user.id);
  await signOut({ redirectTo: "/login" });
}

export async function googleAction() {
  if (!googleEnabled()) redirect("/login");
  await signIn("google", { redirectTo: "/" });
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { email: field(form, "email") };
  try {
    await signIn("credentials", { ...values, password: field(form, "password"), redirectTo: "/" });
  } catch (e) {
    if (!(e instanceof AuthError)) throw e; // the redirect after a successful sign-in
    if (e.type !== "CredentialsSignin") return { error: "Sign-in failed. Try again.", values };
    if ((e as CredentialsSignin).code === "rate_limited") return { error: "Too many tries. Wait 15 minutes, then try again.", values };
    return { error: "Wrong email or password.", values };
  }
  return {};
}

export async function signUpAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { name: field(form, "name"), email: field(form, "email") };
  const parsed = SignupInput.safeParse({ ...values, password: field(form, "password") });
  if (!parsed.success) {
    const bad = parsed.error.issues[0]?.path[0];
    const error = bad === "password" ? "Use a password of at least 8 characters." : bad === "name" ? "Enter your name." : "Enter a valid email address.";
    return { error, values };
  }
  try {
    const ip = clientIp(await headers());
    if (!(await rateLimit(`signup:ip:${ip}`, 10, 60 * 60)) || !(await rateLimit(`signup:${parsed.data.email}`, 3, 60 * 60))) {
      return { error: TOO_MANY, values };
    }
    await startSignup(parsed.data);
  } catch (e) {
    console.error(e);
    return { error: "Couldn't send the confirmation email. Try again later.", values };
  }
  return { done: `Check ${parsed.data.email} for a link to finish signing up.` };
}

export async function forgotAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { email: field(form, "email") };
  const parsed = EmailInput.safeParse(values);
  if (!parsed.success) return { error: "Enter a valid email address.", values };
  try {
    const ip = clientIp(await headers());
    if (!(await rateLimit(`reset:ip:${ip}`, 10, 60 * 60)) || !(await rateLimit(`reset:${parsed.data.email}`, 3, 60 * 60))) {
      return { error: TOO_MANY, values };
    }
    await startReset(parsed.data);
  } catch (e) {
    console.error(e);
    return { error: "Couldn't send the email. Try again later.", values };
  }
  return { done: "If that email has an account, a reset link is on its way." };
}

export async function resetAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = ResetInput.safeParse({ token: field(form, "token"), password: field(form, "password") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.path[0] === "password" ? "Use a password of at least 8 characters." : "This link doesn't work. Ask for a new one." };
  }
  let ok = false;
  try {
    ok = await completeReset(parsed.data);
  } catch (e) {
    console.error(e);
    return { error: "Couldn't save the password. Try again." };
  }
  if (!ok) return { error: "This link has expired or was already used. Ask for a new one." };
  redirect("/login?notice=reset");
}
