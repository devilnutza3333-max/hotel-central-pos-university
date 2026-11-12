import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../db";
import { menuImages } from "../../../db/schema";

export async function GET(request: Request) {
  const menuItemId = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(menuItemId) || menuItemId <= 0) {
    return NextResponse.json({ error: "รหัสรูปไม่ถูกต้อง" }, { status: 400 });
  }
  const [image] = await getDb().select().from(menuImages).where(eq(menuImages.menuItemId, menuItemId)).limit(1);
  if (!image) return new Response(null, { status: 404 });
  const binary = atob(image.base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Response(bytes.buffer, {
    headers: {
      "content-type": image.mimeType,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
