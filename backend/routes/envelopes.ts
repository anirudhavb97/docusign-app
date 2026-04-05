import { Router, Request, Response } from "express";
export const envelopesRouter = Router();

envelopesRouter.get("/", async (_req: Request, res: Response) => {
  res.json({ envelopes: [] });
});

envelopesRouter.get("/:envelopeId", async (req: Request, res: Response) => {
  res.json({ envelopeId: req.params.envelopeId });
});
