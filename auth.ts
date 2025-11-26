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
    async signIn({ user, account, profile }) {
      if (user.email && account) {
        try {
          // Create or update user in MongoDB (defaults to "free" plan for new users)
          await createOrUpdateUser({
            email: user.email,
            name: user.name || null,
            image: user.image || null,
            provider: account.provider,
            providerId: account.providerAccountId,
          });
        } catch (error) {
          console.error("Error creating/updating user in MongoDB:", error);
          // Don't block sign-in if user creation fails
        }
      }
      return true;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        
        // Fetch user plan from MongoDB
        if (session.user.email) {
          try {
            const dbUser = await getUserByEmail(session.user.email);
            if (dbUser) {
              session.user.plan = dbUser.plan;
            } else {
              // Default to free if user not found (shouldn't happen, but safety fallback)
              session.user.plan = "free";
            }
          } catch (error) {
            console.error("Error fetching user plan:", error);
            session.user.plan = "free"; // Default fallback
          }
        }
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});

