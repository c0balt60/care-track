import { redirect } from "next/navigation";
import { UserIcon } from "@/components/icons";
import { EmptyState, param } from "@/components/ui";
import { getViewer, hasProfile } from "@/lib/auth";
import { demoViewer } from "@/lib/mock-data";
import AdminHome from "./_components/AdminHome";
import PatientHome from "./_components/PatientHome";
import PractitionerHome from "./_components/PractitionerHome";
import StaffHome from "./_components/StaffHome";

export default async function Dashboard({ searchParams }: PageProps<"/dashboard">) {
    // getViewer, not requireRole: an account without its profile row should see
    // why it can't do anything yet, not a 404.
    const viewer = await getViewer();
    const sp = await searchParams;
    if (!viewer) redirect("/login");

    if (viewer.role === "admin") return <AdminHome name={viewer.name} />;

    if (!hasProfile(viewer)) {
        const linkedTo = { patient: "a patient profile", practitioner: "a practitioner profile", staff: "a clinic" }[viewer.role];
        return (
            <EmptyState
                icon={<UserIcon />}
                title="Your account isn't set up yet"
                text={`Your account isn't linked to ${linkedTo} yet, so there's nothing to show. Contact Care Track support to finish setting it up.`}
            />
        );
    }

    const demo = demoViewer(viewer);
    if (demo.role === "patient") return <PatientHome viewer={demo} />;
    if (demo.role === "practitioner") return <PractitionerHome viewer={demo} done={param(sp.done)} notice={param(sp.notice)} />;
    return <StaffHome viewer={demo} />;
}
