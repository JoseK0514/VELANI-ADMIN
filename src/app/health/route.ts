import { privateHeaders } from "../../server/http";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    { service: "velani-admin", state: "running" },
    { headers: privateHeaders },
  );
}
