import { handler, serialize } from "@/lib/api";
import { listRecordings, recordingsExt } from "@/lib/yemot/client";

// GET /api/yemot/recordings — live list of recordings in the Yemot extension.
export const GET = handler(async () => {
  const recordings = await listRecordings();
  return serialize({ ext: recordingsExt(), recordings });
});

export const maxDuration = 60;
