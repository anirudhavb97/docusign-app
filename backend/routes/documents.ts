import { Router, Request, Response } from "express";
export const documentsRouter = Router();

documentsRouter.get("/", async (_req: Request, res: Response) => {
  // TODO: fetch from DB with Prisma
  res.json({ documents: [], total: 0 });
});

documentsRouter.get("/:id", async (req: Request, res: Response) => {
  res.json({ id: req.params.id });
});
