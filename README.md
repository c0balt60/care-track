# Care Track

Care Track is a learning project built by a small team of student developers. We use it to practice a modern web stack (Next.js, React, TypeScript, Tailwind CSS), learn to collaborate on a shared codebase, and show our work for internship and co-op applications.

## What it aims to be

Care Track connects patients with doctors and other medical practitioners.

Many healthcare systems run on outdated software and are booked far in advance. Waits for things like scans can stretch to months. Care Track shows when practitioners have open availability, so patients can find a slot and sign up for an appointment.

The app is loosely modeled on parts of [PointClickCare](https://pointclickcare.com/), a widely used healthcare software platform. We're not trying to clone it. The goal is to get hands-on with the kinds of problems that software solves, such as scheduling, patient and practitioner records, and secure access to care data, so we're ready to work on real healthcare software.

The core idea:

- Practitioners publish their open availability.
- Patients browse that availability and sign up for an appointment.
- Both sides use a dashboard to keep track of upcoming appointments.

## How we use AI

The team writes the code. AI agents may help with front-end visual design and documentation and can review our work and suggest next steps, but they don't write backend code. The full rules are in [AGENTS.md](AGENTS.md).

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
