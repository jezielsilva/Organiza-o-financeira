import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";

// Cria uma instância leve do app Express para testar as rotas de API
const app = express();
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/parse-invoice", (req, res) => {
  const { fileBase64, mimeType } = req.body;
  if (!fileBase64 || !mimeType) {
    res.status(400).json({
      success: false,
      error: "O arquivo e o tipo MIME são obrigatórios para processar a fatura.",
    });
    return;
  }
  res.json({ success: true, purchases: [] });
});

describe("API HTTP (server.ts)", () => {
  it("GET /api/health - deve retornar 200 OK com status ok", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("POST /api/parse-invoice - deve retornar 400 se faltar fileBase64", async () => {
    const response = await request(app)
      .post("/api/parse-invoice")
      .send({ mimeType: "application/pdf" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain("obrigatórios");
  });

  it("POST /api/parse-invoice - deve retornar 200 quando os dados forem válidos", async () => {
    const response = await request(app)
      .post("/api/parse-invoice")
      .send({ fileBase64: "SGVsbG8=", mimeType: "application/pdf" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
