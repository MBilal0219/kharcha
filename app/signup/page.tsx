import { AuthFrame, AuthLink, GoogleButton } from "@/components/auth-frame";
import { SignupForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic"; // the Google button depends on runtime env

export default function SignupPage() {
  return (
    <AuthFrame
      title="Create your account"
      sub="We email you a link to confirm it's you."
      footer={
        <>
          Have an account? <AuthLink href="/login">Sign in</AuthLink>
        </>
      }
    >
      <SignupForm />
      <GoogleButton />
    </AuthFrame>
  );
}
