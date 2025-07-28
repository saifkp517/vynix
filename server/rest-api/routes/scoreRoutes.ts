import { Router } from "express";
import type { Request, Response } from "express";
import { rooms } from "../../shared/data";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const gameRouter = Router();

gameRouter.post("/update-details", async (req: Request, res: Response): Promise<void> => {
  const { matchId, userId, updateType } = req.body;

  try {
    // Validate input
    if (!matchId || !userId || !["kill", "death"].includes(updateType)) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const fieldToUpdate = updateType === "kill" ? "killCount" : "deathCount";

    const updated = await prisma.matchPlayer.update({
      where: {
        matchId: matchId,
        playerId: userId
      },
      data: {
        [fieldToUpdate]: { increment: 1 }
      }
    });

    res.status(200).json({ success: true, updated });
  } catch (error: any) {
    if (error.code === 'P2025') {
      // Record not found
      res.status(404).json({ error: "MatchPlayer entry not found" });
    } else {
      console.error("Error updating stats:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

gameRouter.get("/rooms", async (req: Request, res: Response): Promise<void> => {
  try {

    res.status(200).json({ rooms: rooms });
  } catch (error: any) {

    console.error("Error updating stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
})




export default gameRouter;