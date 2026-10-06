/** Kharcha mark: a bus ticket with a rupee notch. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#133d2e" />
      <path
        d="M14 20a4 4 0 0 1 4-4h28a4 4 0 0 1 4 4v7a5 5 0 0 0 0 10v7a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4v-7a5 5 0 0 0 0-10z"
        fill="#8fe3b8"
      />
      <path d="M38 18v28" stroke="#133d2e" strokeWidth="2.5" strokeDasharray="3 3" />
      <path
        d="M21 25h11M21 30h11M25 25c4 0 6 2 6 5s-2 5-6 5h-3l9 8"
        fill="none"
        stroke="#133d2e"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
