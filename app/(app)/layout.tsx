import { AppShell } from "@/components/app-shell";

// Every screen in this group is a static shell rendered from the phone's database,
// so it opens with no signal once the service worker has cached it.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
