import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session-user";

const serialize = (p: any = {}) => ({
  aboutYou: p.aboutYou || "",
  responseStyle: p.responseStyle || "",
  memoryEnabled: p.memoryEnabled !== false,
  memoryAutoSave: p.memoryAutoSave !== false,
});

// GET: the user's personalization and memory settings
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  return NextResponse.json({
    username: user.username,
    email: user.email,
    preferences: serialize(user.preferences),
  });
}

// PATCH: update any subset of preferences
export async function PATCH(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const current = serialize(user.preferences);
  const next = {
    aboutYou:
      typeof body.aboutYou === "string" ? body.aboutYou.slice(0, 1500) : current.aboutYou,
    responseStyle:
      typeof body.responseStyle === "string"
        ? body.responseStyle.slice(0, 1500)
        : current.responseStyle,
    memoryEnabled:
      typeof body.memoryEnabled === "boolean" ? body.memoryEnabled : current.memoryEnabled,
    memoryAutoSave:
      typeof body.memoryAutoSave === "boolean" ? body.memoryAutoSave : current.memoryAutoSave,
  };

  user.preferences = next;
  await user.save();
  return NextResponse.json({ preferences: next });
}
