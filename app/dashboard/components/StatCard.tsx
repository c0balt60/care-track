export default function StatCard({
    title, value, description
}: {
        title: string,
        value: string,
        description: string,
    }) {
    return (
        <div className="card p-30 flex flex-col">
            <h4 className="pb-3 font-bold">
                {title}
            </h4>

            <p className="mt-8 text-3xl font-semibold">
                {value}
            </p>

            <p className="mt-1 text-sx text-gray-500">
                {description}
            </p>
        </div>
    )
}
