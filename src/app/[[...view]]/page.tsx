import { AdminApp } from "../../ui/app";

// Private admin UI. Every screen is decided by the same-origin /api/admin/v1
// answers at request time; nothing is prerendered with data.
export const dynamic = "force-dynamic";

export default function Page() {
  return <AdminApp />;
}
