import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe config. Used by middleware. Must NOT import anything that pulls in
// Node-only modules (bcryptjs, Prisma, pg, etc.). The Credentials provider —
// which needs bcrypt + DB access — lives in auth.ts instead.
export default {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
} satisfies NextAuthConfig;
