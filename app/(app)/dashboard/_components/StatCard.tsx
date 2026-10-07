export default function StatCard({
    title, value, description
}: {
        title: string,
        value: string,
        description?: string,
    }) {
    return (
        <div className="card p-5 flex flex-col">
            <h2 className="text-sm font-medium text-muted">
                {title}
            </h2>

            <p className="mt-2 text-3xl font-semibold">
                {value}
            </p>

            {description && (
                <p className="mt-1 text-xs text-muted">
                    {description}
                </p>
            )}
        </div>
    )
}
