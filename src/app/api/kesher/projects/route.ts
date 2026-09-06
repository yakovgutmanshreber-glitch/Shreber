import { handler, serialize } from "@/lib/api";
import { listStoredProjects, refreshKesherProjects } from "@/lib/kesher/projects";

// GET /api/kesher/projects — cached project list; auto-refreshes from Kesher when
// empty. Add ?refresh=1 to force a re-pull from Kesher.
export const GET = handler(async (req) => {
  const force = new URL(req.url).searchParams.get("refresh") === "1";
  let projects = force ? [] : await listStoredProjects();
  if (projects.length === 0) projects = await refreshKesherProjects();
  return serialize(projects);
});

// POST /api/kesher/projects — force a refresh from Kesher.
export const POST = handler(async () => serialize(await refreshKesherProjects()));

export const maxDuration = 60;
