/**
 * Servidor de produção (Docker): apenas entrega o app estático já compilado.
 * Toda a lógica roda no navegador — leitura de PDF inclusive.
 */
import express from "express";
import path from "path";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const distPath = path.join(process.cwd(), "dist");

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(express.static(distPath, { index: false }));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
