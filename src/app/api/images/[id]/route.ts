import { NextResponse } from "next/server";
import GeneratedImage from "../../../../models/image";
import { requireUser, isObjectId } from "../../../../lib/session-user";

export const runtime = "nodejs";

// GET: serves one of the signed-in user's generated images (?download=1 to save)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  if (!isObjectId(id)) return NextResponse.json({ error: "Invalid image ID" }, { status: 400 });

  const img: any = await GeneratedImage.findOne({ _id: id, user: user._id }).select("data mime").lean();
  if (!img) return NextResponse.json({ error: "Image not found" }, { status: 404 });

  const ext = img.mime === "image/png" ? "png" : img.mime === "image/webp" ? "webp" : "jpg";
  const download = new URL(req.url).searchParams.has("download");
  return new Response(new Uint8Array(img.data.buffer ?? img.data), {
    headers: {
      "Content-Type": img.mime || "image/jpeg",
      // Images never change once generated
      "Cache-Control": "private, max-age=31536000, immutable",
      ...(download && { "Content-Disposition": `attachment; filename="iris-${id}.${ext}"` }),
    },
  });
}
