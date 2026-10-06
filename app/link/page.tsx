import Link from "next/link";
import { respondInviteAction } from "@/app/actions";
import { AuthFrame, AuthLink, GoogleButton } from "@/components/auth-frame";
import { JoinForm } from "@/components/auth-forms";
import { currentUser } from "@/lib/auth/require-user";
import { userByEmail } from "@/lib/server/accounts";
import { byToken } from "@/lib/server/links";

export const dynamic = "force-dynamic";

const button = "flex h-14 w-full items-center justify-center rounded-2xl text-base font-semibold transition active:scale-[0.98]";

// Opened from an invitation email: someone who tracks loans with you asks to share those records.
export default async function LinkPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const link = await byToken(token).catch(() => null);
  if (!link) {
    return (
      <AuthFrame title="This invitation doesn't work" sub="It has expired, was already answered, or was replaced by a newer one. Ask them to send it again." footer={<AuthLink href="/login">Sign in</AuthLink>}>
        <span />
      </AuthFrame>
    );
  }

  const user = await currentUser().catch(() => null);
  const forMe = user?.email.toLowerCase() === link.email;
  const sub = `${link.aName} (${link.aEmail}) tracks money lent and borrowed with you. Accept, and loans and repayments between you two show on both accounts. Nothing else is shared.`;

  return (
    <AuthFrame title={`${link.aName} invites you`} sub={sub}>
      {user && forMe && (
        <form action={respondInviteAction} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <button name="accept" value="1" className={`${button} bg-accent text-accent-ink`}>
            Accept
          </button>
          <button name="accept" value="0" className={`${button} border border-line bg-surface text-ink`}>
            Decline
          </button>
        </form>
      )}

      {user && !forMe && (
        <p className="rounded-2xl bg-gold-soft p-4 text-sm text-ink-2">
          This invitation was sent to <b>{link.email}</b>, and you are signed in as <b>{user.email}</b>. Sign out in Settings, then open the link again and sign
          in with {link.email}.
        </p>
      )}

      {!user &&
        ((await userByEmail(link.email)) ? (
          <>
            <p className="rounded-2xl bg-surface-2 p-4 text-sm text-ink-2">
              You already have an account with <b>{link.email}</b>. Sign in, then accept the request under <b>Money → Loans</b>.
            </p>
            <Link href="/login" className={`${button} bg-accent text-accent-ink`}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            <JoinForm token={token} email={link.email} />
            <GoogleButton />
            <p className="text-center text-xs text-muted">With Google, use {link.email}, then accept the request under Money → Loans.</p>
          </>
        ))}
    </AuthFrame>
  );
}
