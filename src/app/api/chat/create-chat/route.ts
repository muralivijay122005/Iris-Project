import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import Chat from "../../../../models/chat";
import User from "../../../../models/user";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../lib/authoptions";

// POST handler for creating a new chat
export async function POST(req: Request) {
  try {
    console.log("[POST /api/chat/create-chat] Initiating request processing");

    {
      /* Authentication */
    }
    const session = await getServerSession(authOptions);
    console.log(
      "[POST /api/chat/create-chat] Session user email:",
      session?.user?.email || "No session"
    );
    if (!session?.user?.email) {
      console.error(
        "[POST /api/chat/create-chat] No session or user email found"
      );
      return NextResponse.json(
        { error: "Unauthorized: Please log in" },
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    {
      /* Database Connection */
    }
    await connectToDatabase();
    console.log("[POST /api/chat/create-chat] Database connected successfully");

    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      console.error(
        "[POST /api/chat/create-chat] User not found for email:",
        session.user.email
      );
      return NextResponse.json(
        { error: "User not found: Please sign up first" },
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    console.log("[POST /api/chat/create-chat] User found:", user._id);

    {
      /* Request Validation */
    }
    const { title } = await req.json();
    if (!title) {
      console.error(
        "[POST /api/chat/create-chat] Missing title in request body"
      );
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    {
      /* Chat Creation */
    }
    console.log(
      "[POST /api/chat/create-chat] Creating new chat for user:",
      user._id,
      "with title:",
      title
    );
    const newChat = await Chat.create({
      title,
      messages: [],
      user: user._id,
      pinned: false,
    });

    console.log(
      "[POST /api/chat/create-chat] New chat created with ID:",
      newChat._id.toString()
    );

    {
      /* Response */
    }
    return NextResponse.json(
      { chatId: newChat._id },
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[POST /api/chat/create-chat] Error occurred:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
    });
    return NextResponse.json(
      {
        error: "An error occurred while creating the chat",
        details: error.message,
      },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
