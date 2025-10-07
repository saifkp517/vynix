import { Router } from "express";
import type { Request, Response } from "express";
import { getAllOnlinePlayers, getAllRooms } from "../../redis/redisControllers";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const gameRouter = Router();


gameRouter.get("/rooms", async (req: Request, res: Response): Promise<void> => {
  try {
    const rooms = getAllRooms();
    res.status(200).json({ rooms: rooms });
  } catch (error: any) {

    console.error("Error updating stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
})

gameRouter.get("/onlinePlayers", async(req: Request, res: Response ): Promise<void> => {
  try {
    const players = await getAllOnlinePlayers();
    res.json({players});
  } catch(err) {
    console.log("here: ", err);
  }
})

// =============== FRIEND REQUESTS ==================






export default gameRouter;