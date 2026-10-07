import StatCard from "./components/StatCard";

export default function Dashboard() {
    return (
        <div className="min-h-dvh w-80vw">
            <div className="p-20">
                <h1 className="text-2xl font-semibold tracking-tight">
                    Dashboard
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                    Here's what's happening with your clinic today
                </p>
            </div>

            <section className="p-20 grid grid-cols-3 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Upcoming Appointments"
                    value="24"
                    description="Today"
                />

                <StatCard
                    title="Total Patients"
                    value="1,209"
                    description="+ 129"
                />

                <StatCard
                    title="Upcoming Appointments"
                    value="24"
                    description="Today"
                />

                <StatCard
                    title="Upcoming Appointments"
                    value="24"
                    description="Today"
                />

                <StatCard
                    title="Upcoming Appointments"
                    value="24"
                    description="Today"
                />
            </section>
        </div>
    )
}
