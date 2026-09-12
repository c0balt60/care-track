"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Topbar() {
    const path = usePathname();

    const navItems = [
        { name: "Home", href: "/" },
        { name: "About", href: "/about" },
        { name: "Login", href: "/login"}
    ]

    return (
        <header className="navbar">
            <a href="/" className="logo">
                <span className="logo-mark">&gt;_</span>
                CareTrack
            </a>

            <nav className="flex gap-8 ml-auto mr-6">
                {navItems.map((item) => {
                    const active = path == item.href;

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`${active ? "active" : ""}`}
                        >{item.name}</Link>
                    )
                })}
            </nav>
        </header>
    )
}
