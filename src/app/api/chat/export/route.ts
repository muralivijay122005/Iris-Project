import { NextResponse } from "next/server";
import Chat, { serializeMessage } from "@/models/chat";
import { requireUser } from "@/lib/session-user";

// GET: download all chats as JSON
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const chats = await Chat.find({ user: user._id }).sort({ createdAt: -1 }).lean();
  const data = {
    exportedAt: new Date().toISOString(),
    account: user.email,
    chats: chats.map((c: any) => ({
      id: c._id.toString(),
      title: c.title,
      pinned: !!c.pinned,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messages: (c.messages || []).map((m: any) => {
        const s = serializeMessage(m);
        return {
          role: s.role,
          content: s.content,
          model: s.model,
          createdAt: s.createdAt,
          attachments: s.attachments.map((a) => ({ name: a.name, size: a.size, type: a.type })),
        };
      }),
    })),
  };

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="iris-chats-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    },
  });
}
