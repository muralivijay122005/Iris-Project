import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import User from "../models/user";
import { connectToDatabase } from "../lib/mongodb";
import bcrypt from "bcryptjs";

// ✅ Extend NextAuth session types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    name?: string | null;
    email?: string | null;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    // ⚡ Google OAuth2 Login
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),

    // 🔐 Username/Email + Password Login
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username or Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          console.warn("🚫 Missing credentials");
          return null;
        }

        await connectToDatabase();

        const user = await User.findOne({
          $or: [
            { username: credentials.username },
            { email: credentials.username },
          ],
        });

        if (!user) {
          console.warn("🚫 No user found for:", credentials.username);
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isValid) {
          console.warn("🚫 Invalid password for:", credentials.username);
          return null;
        }

        return {
          id: user._id.toString(),
          name: user.username,
          email: user.email,
        };
      },
    }),
  ],

  pages: {
    signIn: "/login", // Custom login page
  },

  callbacks: {
    // 🟢 Handle Google logins (create user if not exists)
    async signIn({ user, account }) {
      try {
        await connectToDatabase();

        if (account?.provider === "google" && user.email) {
          let existingUser = await User.findOne({ email: user.email });

          if (!existingUser) {
            const firstName =
              user.name?.split(" ")[0].toLowerCase() || "anonymous";

            // Usernames are unique; add a suffix if the first name is taken
            let username = firstName;
            while (await User.exists({ username })) {
              username = `${firstName}${Math.floor(1000 + Math.random() * 9000)}`;
            }

            existingUser = await User.create({
              username,
              email: user.email,
              password: "google_oauth", // dummy password for Google accounts
            });

            console.log("🎉 Created new Google user:", user.email);
          }
        }

        return true;
      } catch (error) {
        console.error("🔥 SignIn Callback Error:", error);
        return false;
      }
    },

    // 🟢 Store user info in JWT
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },

    // 🟢 Expose JWT data to session
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name;
        session.user.email = token.email;
      }
      return session;
    },
  },

  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },

  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development", // ✅ debug only in dev
};
