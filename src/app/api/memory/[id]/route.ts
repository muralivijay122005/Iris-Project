import { NextResponse } from "next/server";
import Memory from "@/models/memory";
import { requireUser, isObjectId } from "@/lib/session-user";

type Params = { params: Promise<{ id: string }> };

// PATCH: edit a memory
export async function PATCH(req: Request, { params }: Params) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  if (!isObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim().slice(0, 500) : "";
  if (!content) return NextResponse.json({ error: "Memory can't be empty" }, { status: 400 });

  const memory = await Memory.findOneAndUpdate(
    { _id: id, user: user._id },
    { content },
    { new: true }
  );
  if (!memory) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  return NextResponse.json({ _id: memory._id.toString(), content: memory.content });
}

// DELETE: forget one memory
export async function DELETE(_req: Request, { params }: Params) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  if (!isObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const result = await Memory.deleteOne({ _id: id, user: user._id });
  if (!result.deletedCount) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
