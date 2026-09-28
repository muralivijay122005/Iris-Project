import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/authoptions";
import { Groq } from "groq-sdk";
import Chat from "../../../../models/chat";
import User from "../../../../models/user";
import { connectToDatabase } from "../../../../lib/mongodb";
import { NextResponse } from "next/server";

// Initialize Groq client with API key
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

// Interface for chat completion message parameters
type ChatCompletionMessageParam = {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
};

// POST handler for chat API endpoint
export async function POST(req: Request) {
  {
    /* Database Connection */
  }
  await connectToDatabase();

  {
    /* Authentication */
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    console.warn("[POST /me] No active session found");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await User.findOne({ email: session.user.email });
  if (!user) {
    console.warn("[POST /me] User not found for email:", session.user.email);
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  {
    /* Request Processing */
  }
  const { prompt, chatId } = await req.json();
  console.log("[POST /me] Received prompt:", prompt, "Chat ID:", chatId);

  try {
    let messages: ChatCompletionMessageParam[] = [];

    {
      /* Existing Chat Handling */
    }
    if (chatId) {
      const existingChat = await Chat.findById(chatId);
      console.log("[POST /me] Existing chat user ID:", existingChat?.user);
      console.log("[POST /me] Logged-in user ID:", user._id);

      if (!existingChat) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      }

      if (!existingChat.user?.equals(user._id)) {
        console.warn(
          "[POST /me] Chat does not belong to the authenticated user"
        );
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      messages = existingChat.messages
        .filter(
          (msg: any) =>
            msg.role === "system" ||
            msg.role === "user" ||
            msg.role === "assistant"
        )
        .map((msg: any) => ({
          role: msg.role,
          content: msg.content,
        }));
    }

    {
      /* Message Preparation */
    }
    messages.push({ role: "user", content: prompt });

    {
      /* Groq API Interaction */
    }
    const chatCompletion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages,
    });

    const reply = chatCompletion.choices[0].message.content ?? "";
    messages.push({ role: "assistant", content: reply });

    {
      /* Chat Persistence */
    }
    if (chatId) {
      await Chat.findByIdAndUpdate(chatId, { messages });
    } else {
      const newChat = await Chat.create({
        title: prompt.slice(0, 30),
        messages,
        user: user._id,
      });
      return NextResponse.json({ reply, chatId: newChat._id });
    }

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("[POST /me] Error in Groq API request:", error);
    return NextResponse.json(
      { error: "An error occurred while processing the request" },
      { status: 500 }
    );
  }
}
