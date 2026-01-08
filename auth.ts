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
  // Get base domain from NEXTAUTH_URL (remove protocol and path)
  // This allows cookies to work across both www and non-www subdomains
  basePath: "/api/auth",
  // Mobile-friendly cookie configuration with domain support
  cookies: {
    pkceCodeVerifier: {
      name: `next-auth.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        // Set domain to work across www and non-www
        // Extract domain from NEXTAUTH_URL if set
        ...(process.env.NEXTAUTH_URL && process.env.NODE_ENV === "production" 
          ? { domain: getCookieDomain(process.env.NEXTAUTH_URL) }
          : {}),
      },
    },
    sessionToken: {
      name: `next-auth.session_token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        ...(process.env.NEXTAUTH_URL && process.env.NODE_ENV === "production"
          ? { domain: getCookieDomain(process.env.NEXTAUTH_URL) }
          : {}),
      },
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        ...(process.env.NEXTAUTH_URL && process.env.NODE_ENV === "production"
          ? { domain: getCookieDomain(process.env.NEXTAUTH_URL) }
          : {}),
      },
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        ...(process.env.NEXTAUTH_URL && process.env.NODE_ENV === "production"
          ? { domain: getCookieDomain(process.env.NEXTAUTH_URL) }
          : {}),
      },
    },
  },
});

// Helper function to extract domain from URL and make it work for both www and non-www
function getCookieDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    // Remove 'www.' if present and return the base domain with leading dot
    // This allows cookies to work on both www.example.com and example.com
    const baseDomain = hostname.replace(/^www\./, '');
    
    // Return with leading dot to make it work for subdomains
    return `.${baseDomain}`;
  } catch {
    return '';
  }
}
