import { param } from "@/components/ui";
import { getViewer } from "@/lib/mock-data";
import PatientHome from "./_components/PatientHome";
import PractitionerHome from "./_components/PractitionerHome";
import StaffHome from "./_components/StaffHome";

export default async function Dashboard({ searchParams }: PageProps<"/dashboard">) {
    const viewer = await getViewer();
    const sp = await searchParams;
    if (!viewer) return null; // the (app) layout shows a log-in prompt

    if (viewer.role === "patient") return <PatientHome viewer={viewer} />;
    if (viewer.role === "practitioner") return <PractitionerHome viewer={viewer} done={param(sp.done)} notice={param(sp.notice)} />;
    return <StaffHome viewer={viewer} />;
}
