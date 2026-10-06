import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { mongoClient } from "@/lib/db/client";
import { LoginInput, verifyLogin } from "@/lib/server/accounts";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";

declare module "next-auth" {
  interface Session {
    authAt?: number; // when this session signed in (ms)
  }
}

class RateLimited extends CredentialsSignin {
  code = "rate_limited";
}

/** Google sign-in is offered only when its keys are set, so the button never leads to an error page. */
export function googleEnabled() {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

// Lazy config: nothing touches MongoDB until a request needs it.
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: MongoDBAdapter(() => mongoClient(), { databaseName: process.env.MONGODB_DB ?? "kharcha" }),
  providers: [
    // Linking by email is safe here: Google emails are checked below, and password accounts
    // are only created after the email is confirmed (lib/server/accounts.ts).
    // `select_account` makes Google always ask which account, instead of silently reusing the last one.
    ...(googleEnabled() ? [Google({ allowDangerousEmailAccountLinking: true, authorization: { params: { prompt: "select_account" } } })] : []),
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = LoginInput.safeParse(raw);
        if (!parsed.success) return null;
        const byIp = await rateLimit(`login:ip:${clientIp(request.headers)}`, 30, 15 * 60);
        const byEmail = await rateLimit(`login:${parsed.data.email}`, 10, 15 * 60);
        if (!byIp || !byEmail) throw new RateLimited();
        return verifyLogin(parsed.data);
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 90 * 24 * 60 * 60 }, // stay signed in on the phone for 90 days
  pages: { signIn: "/login", error: "/login" },
  // The Host header is trusted only where the platform sets it (Vercel, or AUTH_TRUST_HOST=true).
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider === "google") return profile?.email_verified === true;
      return true;
    },
    jwt({ token, user }) {
      if (user) token.authAt = Date.now();
      return token;
    },
    session({ session, token }) {
      if (token.sub && session.user) session.user.id = token.sub;
      if (typeof token.authAt === "number") session.authAt = token.authAt;
      return session;
    },
  },
}));
