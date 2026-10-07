import Image from "next/image";

const items: Array<Record<"title" | "desc", string>> = [
  {
    title: "TITLE",
    desc: "the patients will love this app"
  },
  {
    title: "TITLE",
    desc: "the patients will love this app"
  },
  {
    title: "TITLE",
    desc: "the patients will love this app"
  },
  {
    title: "TITLE",
    desc: "the patients will love this app"
  },
  {
    title: "TITLE",
    desc: "the patients will love this app"
  }
]

export default function Home() {
  return (
    <>
      <section className="hero">
        <div>
          <h1>
            Healthcare yes,
            <span>peak stuff...</span>
          </h1>

          <p className="max-w-2xl my-9 text-gray-400 text-xl">
            A lightweight healthcare management system, written
            in typescript using next.js
          </p>

          <div className="flex gap-3">
            <a href="/login" className="button">Get Started</a>
            <a href="/contact" className="button">Something</a>
          </div>
        </div>
      </section>

      <section className="w-[min(1200px,88%)] my-12 mx-auto px-0 py-auto">
        <div className="max-w-175 mb-11">
         <h2>Everything you need to manage clients</h2>
        </div>

        <div className="grid grid-cols-3 gap-3.5">
          {
            items.map((value, index) => (
              <article key={index} className="card">
                <div className="card-icon">&lt;/&gt;</div>
                <h3>{value.title}</h3>
                <p>{value.desc}</p>
              </article>
            ))
          }
        </div>
      </section>
    </>
  );
}
