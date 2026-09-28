import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "../../../../../lib/mongodb";
import Chat from "../../../../../models/chat";
import mongoose from "mongoose";
import { authOptions } from "../../../../../lib/authoptions";

// PATCH handler for toggling chat pin status
export async function PATCH(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    console.log("[PATCH /api/chat/[id]/pin] Initiating request processing");

    {
      /* Authentication */
    }
    const session = await getServerSession(authOptions);
    console.log(
      "[PATCH /api/chat/[id]/pin] Session user ID:",
      session?.user?.id || "No session"
    );
    if (!session?.user?.id) {
      console.error("[PATCH /api/chat/[id]/pin] No session or user ID found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    {
      /* Database Connection */
    }
    await connectToDatabase();
    console.log("[PATCH /api/chat/[id]/pin] Database connected successfully");

    if (!mongoose.Types.ObjectId.isValid(params.id)) {
      console.warn("[PATCH /api/chat/[id]/pin] Invalid chat ID:", params.id);
      return NextResponse.json({ error: "Invalid chat ID" }, { status: 400 });
    }

    {
      /* Chat Validation */
    }
    const chat = await Chat.findById(params.id);
    if (!chat) {
      console.warn(
        "[PATCH /api/chat/[id]/pin] Chat not found for ID:",
        params.id
      );
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    if (chat.user.toString() !== session.user.id) {
      console.warn(
        "[PATCH /api/chat/[id]/pin] Chat does not belong to this user:",
        {
          chatUser: chat.user.toString(),
          sessionUser: session.user.id,
        }
      );
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    {
      /* Pin Status Update */
    }
    chat.pinned = !chat.pinned;
    await chat.save();
    console.log(
      "[PATCH /api/chat/[id]/pin] Chat pinned status updated:",
      chat.pinned
    );

    {
      /* Response */
    }
    return NextResponse.json({
      message: chat.pinned ? "Chat pinned" : "Chat unpinned",
    });
  } catch (error: any) {
    console.error("[PATCH /api/chat/[id]/pin] Error occurred:", {
      message: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: "Failed to update chat pin status", details: error.message },
      { status: 500 }
    );
  }
}
