import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/authoptions";
import { connectToDatabase } from "../../../../lib/mongodb";
import User from "../../../../models/user";
import Chat from "../../../../models/chat";
import { NextResponse } from "next/server";

// GET handler for retrieving chat history
export async function GET() {
  try {
    console.log("[GET /api/chat/history] Initiating request processing");

    {
      /* Authentication */
    }
    const session = await getServerSession(authOptions);
    console.log(
      "[GET /api/chat/history] Session user email:",
      session?.user?.email || "No session"
    );
    if (!session?.user?.email) {
      console.error("[GET /api/chat/history] No session or user email found");
      return NextResponse.json(
        { error: "Unauthorized: Please log in" },
        { status: 401 }
      );
    }

    {
      /* Database Connection */
    }
    await connectToDatabase();
    console.log("[GET /api/chat/history] Database connected successfully");

    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      console.error(
        "[GET /api/chat/history] User not found for email:",
        session.user.email
      );
      return NextResponse.json(
        { error: "User not found: Please sign up first" },
        { status: 404 }
      );
    }
    console.log("[GET /api/chat/history] User found:", user._id);

    {
      /* Database Query */
    }
    const chats = await Chat.find({ user: user._id })
      .sort({ updatedAt: -1 })
      .select("_id title messages updatedAt createdAt")
      .lean();
    console.log("[GET /api/chat/history] Found chats:", chats.length);

    {
      /* Response */
    }
    return NextResponse.json(chats, { status: 200 });
  } catch (error: any) {
    console.error("[GET /api/chat/history] Error occurred:", {
      message: error.message,
      name: error.name,
      stack: error.stack,
    });
    return NextResponse.json(
      {
        error: "Failed to fetch chat history",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
