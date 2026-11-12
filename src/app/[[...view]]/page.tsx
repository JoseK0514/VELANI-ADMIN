// Every admin address resolves here so the root layout renders for it. The
// page itself is empty: it is replaced on each navigation, so the admin app
// and its pending-operation store live in the persistent root layout instead
// (src/app/layout.tsx), which reads the address with usePathname.
export const dynamic = "force-dynamic";

export default function Page() {
  return null;
}
