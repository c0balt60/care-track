import { NextResponse } from "next/server";


export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password } = body;

        if (!email || !password) {
            return NextResponse.json(
                { message: "Email and password are required" },
                { status: 400 }
            );
        }

        // Dummy user logic
        const dummy = {
            id: 'user_12345',
            email: "you@email.com",
            passwordHash: "$2a$10$YourMockedBcryptHash"
        }

        if (email !== dummy.email || password !== "123") {
            return NextResponse.json(
                { message: "Invalid email or password" },
                { status: 401 }
            );
        }

        // Create session token here (after login)

        // Construct response
        const response = NextResponse.json(
            { message: "Login Successful", userId: dummy.id },
            {status: 200}
        );

        // Set HTTP-Only cookie for security (prevents XSS attacks)
        // const cookieStore = await cookies();
        // cookieStore.set('session_token', token, {
        //   httpOnly: true,
        //   secure: process.env.NODE_ENV === 'production',
        //   sameSite: 'lax',
        //   maxAge: 60 * 60 * 24, // 1 day
        //   path: '/',
        // });

        return response
    } catch (error) {
        console.error("Login API error: ", error);
        return NextResponse.json(
            { message: "Internal server error" },
            {status:500}
        )
    }
}
