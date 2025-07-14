import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const router = Router();

export async function authorizeSession(sessionId: string | null): Promise<{ userId: string } | null> {
    try {
        if (!sessionId) {
            return null;
        }

        const session = await prisma.session.findUnique({
            where: { id: sessionId },
        });

        if (!session) {
            console.log("invalid session");
            return null;
        }

        return { userId: session.userId };
    } catch (error) {
        console.error("Authorization error:", error);
        return null;
    }
}



// Register User
router.post("/register", async (req, res): Promise<void> => {
    const { username, email, password } = req.body;

    try {
        // Check if user already exists
        const existingUser = await prisma.user.findUnique({ where: { email } })
        if (existingUser) {
            res.status(400).json({ error: "User already exists" });
            return;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const newUser = await prisma.user.create({
            data: {
                username,
                email,
                password: hashedPassword,
                provider: "credentials",
            },
        });

        console.log(newUser)

        res.status(201).json({ message: "User registered successfully", user: newUser });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// Login User
router.post("/login", async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;

    const existing_session_id = req.cookies["session_id"];


    try {
        // Check if user exists
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            console.log("invalid email or password")
            res.status(400).json({ error: "Invalid email or password" });
            return;
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password!);
        if (!isMatch) {
            console.log("invalid email or password")
            res.status(400).json({ error: "Invalid email or password" });
            return;
        }

        if (!existing_session_id) {
            const session = await prisma.session.create({
                data: {
                    userId: user.id,
                    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
                }
            })

            res.cookie("session_id", session.id, {
                httpOnly: true, // Prevent JavaScript access
                secure: process.env.NODE_ENV === "production", // Secure in production (HTTPS only)
                maxAge: 60 * 60 * 1000, // 1 hour expiration
                path: "/"
            });
            res.status(201).json({ message: "Logged In" });
            return;
        } else {
            const existing_session = await prisma.session.findUnique({ where: { id: existing_session_id } });

            if (!existing_session) {
                const session = await prisma.session.create({
                    data: {
                        userId: user.id,
                        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
                    }
                })

                res.cookie("session_id", session.id, {
                    httpOnly: true, // Prevent JavaScript access
                    secure: process.env.NODE_ENV === "production", // Secure in production (HTTPS only)
                    maxAge: 60 * 60 * 1000, // 1 hour expiration
                    path: "/"
                });
                res.status(201).json({ message: "Logged In" });
                return;
            } else {
                if (existing_session.expiresAt < new Date()) {

                    await prisma.session.delete({ where: { id: existing_session.id } });

                    const session = await prisma.session.create({
                        data: {
                            userId: user.id,
                            expiresAt: new Date(Date.now() + 60 * 60 * 1000)
                        }
                    })

                    res.cookie("session_id", session.id, {
                        httpOnly: true, // Prevent JavaScript access
                        secure: process.env.NODE_ENV === "production", // Secure in production (HTTPS only)
                        maxAge: 60 * 60 * 1000, // 1 hour expiration
                        path: "/"
                    });
                    return;
                }
            }
        }
        res.status(201).json({ message: "Logged In" });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Server error" });
    }
});




router.post("/oauth/login", async (req: Request, res: Response): Promise<void> => {
    console.log("called")
    const { username, email, image, provider } = req.body;

    try {
        let user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    username,
                    email,
                    image,
                    password: null, // No password for Google users
                    provider
                },
            });
        }



        res.status(200).json({ message: "Google OAuth user stored successfully", user });
    } catch (error) {
        console.error("Google OAuth error:", error);
        res.status(500).json({ error: "Server error" });
    }
});


router.post("/logout", async (req: Request, res: Response): Promise<void> => {
    try {
        const sessionId = req.cookies["session_id"];
        if (sessionId) {
            const delete_session = await prisma.session.findUnique({ where: { id: sessionId } });

            if (delete_session) {
                await prisma.session.delete({ where: { id: sessionId } });
            }

            res.clearCookie('session_id');
            res.status(200).json({ message: "Logged Out Successfully" });
        }
    } catch (error) {
        console.error("Logout Error:", error);
        res.status(500).json({ error: "Server error" });
    }
})

router.get("/me", async (req: Request, res: Response): Promise<void> => {
    const session_id = req.cookies["session_id"];

    try {
        if (session_id) {

            const session = await prisma.session.findUnique({
                where: {
                    id: session_id,
                    expiresAt: { gt: new Date() }
                }
            });

            if (session) {
                const user_details = await prisma.user.findUnique({ where: { id: session?.userId } });

                res.status(200).json({
                    username: user_details?.username,
                    email: user_details?.email,
                    id: user_details?.id,
                    image: user_details?.image
                });
                return;
            }
        }

        res.status(400).json({ error: "Session Id is invalid or expired" });
        return;
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "Server Error" });
        return;
    }


})

export default router;
