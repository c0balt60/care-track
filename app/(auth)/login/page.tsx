"use client";
import Link from "next/link";
import { useRouter } from "next/navigation"
import React, { useState } from "react";

export default function Login() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPass] = useState('');
    const [err, setErr] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const submit = async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        setErr('');
        setIsLoading(true);

        try {
            const response = await fetch('api/auth/login', {
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Something went wrong");
            }

            // Redirect to dashboard on successful login
            router.push("/dashboard");
            router.refresh();
        } catch (e: any) {
            setErr(e.message || "Invalid credentials");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="card p-6 sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
            <p className="mt-1 text-muted">Welcome back. Log in to book and manage appointments.</p>

            <form className="mt-6 space-y-4" onSubmit={submit}>
                {err && (
                    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {err}
                    </div>
                )}

                <div>
                    <label htmlFor="email-address" className="label">
                        Email
                    </label>
                    <input
                        id="email-address"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="input"
                        placeholder="name@example.com"
                    />
                </div>

                <div>
                    <label htmlFor="password" className="label">
                        Password
                    </label>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPass(e.target.value)}
                        className="input"
                    />
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="btn btn-primary w-full disabled:opacity-60"
                >
                    {isLoading ? "Logging in…" : "Log in"}
                </button>
            </form>

            <p className="mt-6 text-center text-sm text-muted">
                New to CareTrack? <Link href="/signup" className="link">Create an account</Link>
            </p>
        </div>
    )
}
