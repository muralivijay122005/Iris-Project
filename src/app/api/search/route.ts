import { NextResponse } from "next/server";
import Chat from "@/models/chat";
import { requireUser, escapeRegex } from "@/lib/session-user";

// Returns a short excerpt of `text` around the first match of `re`
function snippet(text: string, re: RegExp) {
  const m = re.exec(text);
  if (!m) return null;
  const start = Math.max(0, m.index - 40);
  const end = Math.min(text.length, m.index + m[0].length + 80);
  return (
    (start > 0 ? "…" : "") +
    text.slice(start, end).replace(/\s+/g, " ").trim() +
    (end < text.length ? "…" : "")
  );
}

// GET: search the user's chats by title and message content
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("query")?.trim();
  if (!query) return NextResponse.json({ chats: [] });

  const { user, error } = await requireUser();
  if (error) return error;

  try {
    const pattern = escapeRegex(query.slice(0, 100));
    const chats = await Chat.find({
      user: user._id,
      $or: [
        { title: { $regex: pattern, $options: "i" } },
        { "messages.content": { $regex: pattern, $options: "i" } },
      ],
    })
      .sort({ updatedAt: -1 })
      .limit(20)
      .select("_id title pinned messages.content messages.role createdAt updatedAt")
      .lean();

    const re = new RegExp(pattern, "i");
    return NextResponse.json({
      chats: chats.map((c: any) => {
        const hit = (c.messages || []).find((m: any) => re.test(m.content || ""));
        return {
          _id: c._id.toString(),
          title: c.title,
          pinned: !!c.pinned,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          snippet: hit ? snippet(hit.content, re) : null,
        };
      }),
    });
  } catch (err: any) {
    console.error("[GET /api/search] Error:", err.message);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
