import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX = 5 * 1024 * 1024; // 5 MB

// Upload a student photo to the public `student-photos` bucket (service role,
// bypasses storage RLS) and return its public URL. Returns null on unsupported
// type / too large / upload error — the caller then just keeps the old photo.
// Path is timestamped so the public URL changes on each upload (cache-busting).
export async function uploadStudentPhoto(studentId: string, file: File): Promise<string | null> {
  const ext = EXT[file.type];
  if (!ext || file.size === 0 || file.size > MAX) return null;
  const db = createAdminClient();
  const buf = Buffer.from(await file.arrayBuffer());
  const path = `students/${studentId}-${Date.now()}.${ext}`;
  const { error } = await db.storage.from("student-photos").upload(path, buf, {
    contentType: file.type,
    upsert: true,
  });
  if (error) return null;
  return db.storage.from("student-photos").getPublicUrl(path).data.publicUrl;
}

const DOC_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

// Upload a leave-request document to the PRIVATE `leave-docs` bucket. Returns the
// storage path (not a URL — admins fetch a signed URL to view). Null if the type
// is unsupported / too large / upload fails.
export async function uploadLeaveDoc(key: string, file: File): Promise<string | null> {
  const ext = DOC_EXT[file.type];
  if (!ext || file.size === 0 || file.size > MAX) return null;
  const db = createAdminClient();
  const buf = Buffer.from(await file.arrayBuffer());
  const path = `leave/${key}-${Date.now()}.${ext}`;
  const { error } = await db.storage.from("leave-docs").upload(path, buf, { contentType: file.type, upsert: true });
  if (error) return null;
  return path;
}
