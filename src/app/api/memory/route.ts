import { NextResponse } from "next/server";
import Memory from "@/models/memory";
import { requireUser } from "@/lib/session-user";

const serialize = (m: any) => ({
  _id: m._id.toString(),
  content: m.content,
  source: m.source,
  createdAt: m.createdAt,
});

// GET: list saved memories, newest first
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const memories = await Memory.find({ user: user._id }).sort({ createdAt: -1 }).lean();
  return NextResponse.json(memories.map(serialize));
}

// POST: add a memory manually
export async function POST(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim().slice(0, 500) : "";
  if (!content) return NextResponse.json({ error: "Memory can't be empty" }, { status: 400 });

  const memory = await Memory.create({ user: user._id, content, source: "manual" });
  return NextResponse.json(serialize(memory), { status: 201 });
}

// DELETE: forget everything
export async function DELETE() {
  const { user, error } = await requireUser();
  if (error) return error;
  const result = await Memory.deleteMany({ user: user._id });
  return NextResponse.json({ deleted: result.deletedCount });
}
