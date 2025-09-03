// /rest-api/index.ts
import express from "express";
import cors from "cors";
import { allowedOrigins } from "../redis/redisControllers";
import cookieParser from "cookie-parser";
import { PrismaClient } from "@prisma/client";
import authRouter from "./routes/authRoutes";
import gameRouter from "./routes/gameRoutes";

const app = express();
const prisma = new PrismaClient();

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());
app.use("/auth", authRouter);
app.use("/game", gameRouter);

const PORT = 3001;
app.listen(PORT, () => console.log(`REST API running on port ${PORT}`));

