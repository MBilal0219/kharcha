import { AuthFrame, AuthLink } from "@/components/auth-frame";
import { ResetForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthFrame
      title="Choose a new password"
      sub={token ? "Saving it signs you out on your other devices." : "This link doesn't work. Ask for a new one."}
      footer={<AuthLink href={token ? "/login" : "/forgot"}>{token ? "Back to sign in" : "Send a new link"}</AuthLink>}
    >
      {token && <ResetForm token={token} />}
    </AuthFrame>
  );
}
