import { connectToDatabase } from "../../../../lib/mongodb";
import Chat from "../../../../models/chat";
import { NextRequest, NextResponse } from "next/server";

// POST handler for saving chat messages
export async function POST(req: NextRequest) {
  try {
    console.log("[POST /api/chat/save] Initiating request processing");

    {
      /* Request Validation */
    }
    const { prompt, chatId, isTemporary } = await req.json();
    if (!prompt) {
      console.error("[POST /api/chat/save] Missing prompt in request body");
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    {
      /* Simulate AI Response */
    }
    const aiReply = `This is a response to: ${prompt}`;

    {
      /* Temporary Chat Handling */
    }
    if (isTemporary) {
      console.log("[POST /api/chat/save] Processing temporary chat");
      return NextResponse.json(
        { reply: aiReply, chatId: null },
        { status: 200 }
      );
    }

    {
      /* Database Connection */
    }
    await connectToDatabase();
    console.log("[POST /api/chat/save] Database connected successfully");

    {
      /* Chat Persistence */
    }
    let updatedChat;
    if (chatId) {
      console.log("[POST /api/chat/save] Updating existing chat:", chatId);
      updatedChat = await Chat.findByIdAndUpdate(
        chatId,
        {
          $push: {
            messages: [
              { role: "user", content: prompt },
              { role: "assistant", content: aiReply },
            ],
          },
        },
        { new: true }
      );
    } else {
      console.log(
        "[POST /api/chat/save] Creating new chat with title:",
        prompt.slice(0, 30)
      );
      updatedChat = await Chat.create({
        title: prompt.slice(0, 30),
        messages: [
          { role: "user", content: prompt },
          { role: "assistant", content: aiReply },
        ],
      });
    }

    console.log(
      "[POST /api/chat/save] Chat saved successfully, ID:",
      updatedChat ? updatedChat._id : "None"
    );

    {
      /* Response */
    }
    return NextResponse.json(
      { reply: aiReply, chatId: updatedChat ? updatedChat._id : null },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[POST /api/chat/save] Error occurred:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    return NextResponse.json(
      { error: "Failed to process chat", details: error.message },
      { status: 500 }
    );
  }
}
