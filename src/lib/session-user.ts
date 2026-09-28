import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "./authoptions";
import { connectToDatabase } from "./mongodb";
import User from "../models/user";

// Resolves the signed-in user's document, or an error response to return
export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized: Please log in" }, { status: 401 }),
    };
  }
  await connectToDatabase();
  const user = await User.findOne({ email: session.user.email });
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "User not found" }, { status: 404 }),
    };
  }
  return { user, session, error: null };
}

export const isObjectId = (id: unknown): id is string =>
  typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
