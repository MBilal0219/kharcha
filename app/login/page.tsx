import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/require-user";
import { AuthFrame, AuthLink, GoogleButton } from "@/components/auth-frame";
import { LoginForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  reset: "Password saved. Sign in with your new password.",
  verified: "Email confirmed. Sign in to start.",
};

// Auth.js sends its error code back in the URL. Saying which one it was makes a failed sign-in diagnosable.
const SIGN_IN_ERRORS: Record<string, string> = {
  AccessDenied: "Google didn't confirm this email, or the sign-in was cancelled. Try again.",
  Configuration: "Sign-in hit a server problem. Try again in a moment.",
  OAuthCallbackError: "Google sign-in was interrupted. Try again.",
  OAuthSignin: "Couldn't reach Google. Check your connection and try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  let signedIn = false;
  try {
    signedIn = Boolean(await currentUser());
  } catch {
    // Auth not configured yet (missing env); show the page anyway.
  }
  if (signedIn) redirect("/");
  const { notice, error } = await searchParams;

  return (
    <AuthFrame
      title="Know what you can spend today. Save the rest."
      hero={
        <div className="ticket anim-rise overflow-hidden" style={{ ["--cut" as string]: "110px" }}>
          <div className="ticket-grain" />
          <div className="ticket-top flex flex-col justify-end p-5">
            <p className="eyebrow text-ticket-muted">Safe to spend today</p>
            <p className="font-display text-5xl font-bold tracking-tight">Rs 333</p>
          </div>
          <div className="perforation" />
          <div className="flex items-center justify-between p-5 text-sm">
            <span className="text-ticket-muted">Set aside</span>
            <span className="font-semibold text-ticket-gold">Rs 500 safe</span>
          </div>
        </div>
      }
      footer={
        <>
          New here? <AuthLink href="/signup">Create an account</AuthLink>
        </>
      }
    >
      {notice && NOTICES[notice] && (
        <p role="status" className="rounded-2xl bg-accent-soft px-4 py-3 text-sm font-semibold text-accent">
          {NOTICES[notice]}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {SIGN_IN_ERRORS[error] ?? "Sign-in didn't finish. Try again."} <span className="font-normal text-muted">({error})</span>
        </p>
      )}
      <LoginForm />
      <GoogleButton />
    </AuthFrame>
  );
}
