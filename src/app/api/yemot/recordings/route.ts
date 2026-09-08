import { handler, serialize } from "@/lib/api";
import { listRecordings, recordingsExt } from "@/lib/yemot/client";

// GET /api/yemot/recordings — live list of recordings in the Yemot extension.
export const GET = handler(async () => {
  const ext = recordingsExt();
  const recordings = await listRecordings(ext);
  return serialize({ ext, recordings });
});

export const maxDuration = 60;
