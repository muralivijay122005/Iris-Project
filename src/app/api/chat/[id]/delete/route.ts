import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { connectToDatabase } from "@/lib/mongodb";
import Chat from "@/models/chat";
import User from "@/models/user";
import mongoose from "mongoose";
import { authOptions } from "@/lib/authoptions";

// DELETE handler for deleting a chat
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log("[DELETE /api/chat/[id]/delete] Initiating request processing");

    {
      /* Authentication */
    }
    const session = await getServerSession(authOptions);
    console.log(
      "[DELETE /api/chat/[id]/delete] Session user email:",
      session?.user?.email || "No session"
    );
    if (!session?.user?.email) {
      console.error(
        "[DELETE /api/chat/[id]/delete] No session or user email found"
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    {
      /* Database Connection */
    }
    console.log("[DELETE /api/chat/[id]/delete] Connecting to database...");
    await connectToDatabase();
    console.log(
      "[DELETE /api/chat/[id]/delete] Database connected successfully"
    );

    const { id } = await params;
    console.log("[DELETE /api/chat/[id]/delete] Chat ID from params:", id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.warn("[DELETE /api/chat/[id]/delete] Invalid chat ID:", id);
      return NextResponse.json({ error: "Invalid chat ID" }, { status: 400 });
    }

    {
      /* User Validation */
    }
    console.log(
      "[DELETE /api/chat/[id]/delete] Finding user with email:",
      session.user.email
    );
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      console.warn(
        "[DELETE /api/chat/[id]/delete] User not found for email:",
        session.user.email
      );
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.log(
      "[DELETE /api/chat/[id]/delete] Found user with ID:",
      user._id.toString()
    );

    {
      /* Chat Deletion */
    }
    console.log(
      "[DELETE /api/chat/[id]/delete] Deleting chat with ID:",
      id,
      "for user:",
      user._id.toString()
    );
    const chat = await Chat.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(id),
      user: user._id,
    });

    if (!chat) {
      console.warn(
        "[DELETE /api/chat/[id]/delete] Chat not found or unauthorized for ID:",
        id
      );
      return NextResponse.json(
        { error: "Chat not found or unauthorized" },
        { status: 404 }
      );
    }

    console.log(
      "[DELETE /api/chat/[id]/delete] Chat deleted successfully:",
      id
    );

    {
      /* Response */
    }
    return NextResponse.json({ message: "Chat deleted successfully" });
  } catch (error: any) {
    console.error("[DELETE /api/chat/[id]/delete] Error occurred:", {
      message: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      {
        error: "An error occurred while deleting the chat",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
