import { redirect } from "next/navigation";
import { AuthFrame, AuthLink } from "@/components/auth-frame";
import { completeSignup } from "@/lib/server/accounts";

export const dynamic = "force-dynamic";

// Opened from the confirmation email: creates the account, then sends the user to sign in.
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  let ok = false;
  try {
    ok = Boolean(token) && (await completeSignup(token!));
  } catch (e) {
    console.error(e);
  }
  if (ok) redirect("/login?notice=verified");

  return (
    <AuthFrame
      title="This link doesn't work"
      sub="It has expired or was already used. If you opened it before, your account is ready: sign in."
      footer={<AuthLink href="/signup">Sign up again</AuthLink>}
    >
      <AuthLink href="/login">Sign in</AuthLink>
    </AuthFrame>
  );
}
