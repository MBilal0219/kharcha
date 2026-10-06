import type { Metadata } from "next";
import { ContactLine, Legal, List, Part } from "@/components/legal";

export const metadata: Metadata = { title: "Terms · Kharcha" };

export default function TermsPage() {
  return (
    <Legal title="Terms" updated="5 October 2026">
      <Part title="Using Kharcha">
        <List
          items={[
            "Kharcha is a free tool for tracking your own money. It is not financial advice.",
            "Keep your password to yourself. You are responsible for what happens in your account.",
            "Don't try to break the service, get into other people's accounts, or flood it with automated requests. Accounts that do can be removed.",
          ]}
        />
      </Part>
      <Part title="Your data">
        <p>What you enter stays yours. You can export it or delete your account at any time. The Privacy page says what is stored and where.</p>
      </Part>
      <Part title="No guarantees">
        <p>
          Kharcha is provided as it is. We work to keep it running and your data safe, but we can't promise it will always be available or
          free of mistakes. Check important numbers yourself and keep a backup of anything you can't afford to lose.
        </p>
      </Part>
      <Part title="Changes">
        <p>These terms can change. The date at the top shows the latest version.</p>
      </Part>
      <ContactLine />
    </Legal>
  );
}
