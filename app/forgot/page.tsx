import { AuthFrame, AuthLink } from "@/components/auth-frame";
import { ForgotForm } from "@/components/auth-forms";

export default function ForgotPage() {
  return (
    <AuthFrame
      title="Reset your password"
      sub="Enter your email and we send you a link. It also works if you signed up with Google and want a password."
      footer={<AuthLink href="/login">Back to sign in</AuthLink>}
    >
      <ForgotForm />
    </AuthFrame>
  );
}
