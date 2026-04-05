import { Router, Request, Response } from "express";
export const webhooksRouter = Router();

// DocuSign Connect webhook - fires when envelope status changes
webhooksRouter.post("/docusign", async (req: Request, res: Response) => {
  const event = req.body;
  console.log("[webhook/docusign] Event:", event?.event, "EnvelopeId:", event?.data?.envelopeId);
  // TODO: update DB status, notify payer
  res.json({ received: true });
});

// Agreement Desk email webhook
webhooksRouter.post("/agreement-desk", async (req: Request, res: Response) => {
  console.log("[webhook/agreement-desk] Fax received:", req.body);
  res.json({ received: true });
});
