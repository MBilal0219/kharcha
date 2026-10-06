import type { Metadata } from "next";
import { ContactLine, Legal, List, Part } from "@/components/legal";

export const metadata: Metadata = { title: "Privacy · Kharcha" };

export default function PrivacyPage() {
  return (
    <Legal title="Privacy" updated="5 October 2026">
      <Part title="What Kharcha stores">
        <List
          items={[
            "Your name and email. If you sign in with Google, also your Google profile picture address.",
            "Your password, only as a one-way hash. Nobody can read it back, including us.",
            "What you enter: your budget and schedule, expenses, money in, wallets, categories, money set aside, savings goals, loans and the names of people you add to loans.",
            "If you turn on reminders, the address your browser gives us to send notifications to this device.",
            "Your IP address, for up to one hour, to limit repeated sign-in and sign-up attempts.",
          ]}
        />
      </Part>
      <Part title="Where it is kept">
        <p>
          Your entries are saved on your phone first, then copied to our database so you can use them on another device. The services that
          process data for us are MongoDB Atlas (database), Vercel (hosting) and Google (Gmail sends the sign-up and password emails; Google
          sign-in only if you choose it).
        </p>
      </Part>
      <Part title="What we don't do">
        <List items={["No ads.", "No analytics or tracking scripts.", "We don't sell or share your data.", "One cookie only: the one that keeps you signed in."]} />
      </Part>
      <Part title="Your controls">
        <List
          items={[
            "Export everything as CSV or JSON in Settings → Data & sync.",
            "Delete your account in Settings → Delete account. This removes your account and all entries from the database straight away.",
            "Weekly encrypted database backups are kept for up to 90 days, then deleted. A deleted account disappears from them within that time.",
          ]}
        />
      </Part>
      <ContactLine />
    </Legal>
  );
}
