import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Augment the session/user types with our `role` field.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "user";
    } & DefaultSession["user"];
  }
  interface User {
    role?: string;
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // JWT strategy is required so the Credentials provider can be mixed with the
  // OAuth adapter. Google sign-ins are still persisted via the adapter.
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      credentials: {
        email: { label: "אימייל", type: "email" },
        password: { label: "סיסמה", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) return null;
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.displayName ?? user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    // On first Google login the adapter creates the User with role default 'user'.
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        const existing = await prisma.user.findUnique({ where: { email: user.email } });
        if (existing && !existing.googleId && account.providerAccountId) {
          await prisma.user.update({
            where: { id: existing.id },
            data: { googleId: account.providerAccountId },
          });
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.uid = (user as { id?: string }).id ?? token.sub;
        token.role = (user as { role?: string }).role ?? "user";
      }
      // Keep role fresh from DB if missing.
      if (token.uid && !token.role) {
        const dbUser = await prisma.user.findUnique({ where: { id: token.uid as string } });
        token.role = dbUser?.role ?? "user";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? token.sub ?? "";
        session.user.role = (token.role as "admin" | "user") ?? "user";
      }
      return session;
    },
  },
});
