"use client";
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
        <div className="flex min-h-dvh justify-center items-center">
            <div className="w-full max-w-md space-y-8 bg-(--surface) p-8 rounded-xl shadow-md ">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-500">
                        Login
                    </h2>
                </div>

                <form className="mt-8 space-y-6" onSubmit={submit}>
                    {err && (
                        <div className="rounded-md bg-red-800 p-4 text-sm font-bold text-white border border-red-500">
                            {err}
                        </div>
                    )}

                    <div className="space-y-4 rounded-md shadow-sm">
                        <div>
                            <label htmlFor="email-address" className="block text-sm font-medium text-gray-700 mb-1">
                                Email Address
                            </label>
                            <input
                                id="email-address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="block w-full rounded-md px-3 py-2 focus:outline-none sm:text-sm"
                                placeholder="name@exmaple.com"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
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
                                className="block w-full rounded-md px-3 py-2 focus:outline-none sm:text-sm"
                                placeholder="*********"
                            />
                        </div>
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="button group relative flex w-full justify-center rounded-md px-3 py-2 text-sm font-semibold"
                        >
                            {isLoading ? 'Signing in...' : "Sign in"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
