import { NextResponse } from "next/server";
import Chat from "../../../../models/chat";
import { requireUser, isObjectId } from "../../../../lib/session-user";

type Params = { params: Promise<{ id: string }> };

// PUT: rename a chat
export async function PUT(req: Request, { params }: Params) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  if (!isObjectId(id)) return NextResponse.json({ error: "Invalid chat ID" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 100) : "";
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  // timestamps: false keeps the chat's position in the history list
  const chat = await Chat.findOneAndUpdate(
    { _id: id, user: user._id },
    { title },
    { new: true, timestamps: false }
  );
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

  return NextResponse.json({ title: chat.title });
}

// PATCH: pin or unpin a chat
export async function PATCH(req: Request, { params }: Params) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  if (!isObjectId(id)) return NextResponse.json({ error: "Invalid chat ID" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (typeof body?.pinned !== "boolean") {
    return NextResponse.json({ error: "Pinned status is required" }, { status: 400 });
  }

  const chat = await Chat.findOneAndUpdate(
    { _id: id, user: user._id },
    { pinned: body.pinned },
    { new: true, timestamps: false }
  );
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

  return NextResponse.json({ pinned: chat.pinned });
}
