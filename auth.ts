import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { createOrUpdateUser, getUserByEmail } from "@/lib/db/users";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
  ],
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (user.email && account) {
        try {
          await createOrUpdateUser({
            email: user.email,
            name: user.name || null,
            image: user.image || null,
            provider: account.provider,
            providerId: account.providerAccountId,
          });
        } catch (error) {
          console.error("Error creating/updating user:", error);
        }
      }
      return true;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;

        if (session.user.email) {
          try {
            const dbUser = await getUserByEmail(session.user.email);
            session.user.plan = dbUser?.plan ?? "free";
          } catch {
            session.user.plan = "free";
          }
        }
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true, // Required for Vercel and mobile browsers
  // Mobile-friendly cookie configuration
  cookies: {
    pkceCodeVerifier: {
      name: `next-auth.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: "lax", // Use "lax" instead of "none" for better mobile compatibility
        path: "/",
        secure: process.env.NODE_ENV === "production", // Secure cookies in production
      },
    },
    sessionToken: {
      name: `next-auth.session_token`,
      options: {
        httpOnly: true,
        sameSite: "lax", // Better mobile browser support
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
});
