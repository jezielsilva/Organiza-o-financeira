import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import fs from "fs/promises";
import { existsSync } from "fs";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Aumenta o limite para suportar PDFs e imagens pesadas codificadas em Base64
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API - Rota de saúde simples
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API - Processamento de Faturas via Microserviço Local (Python/pdfplumber)
  app.post("/api/parse-invoice", async (req, res) => {
    try {
      const { fileBase64, mimeType, fileName, referenceMonth: reqRefMonth } = req.body;
      const refMonth = reqRefMonth || new Date().toISOString().substring(0, 7);
      const targetYear = refMonth.split("-")[0] || new Date().getFullYear().toString();

      if (!fileBase64 || !mimeType) {
        res.status(400).json({
          success: false,
          error: "O arquivo e o tipo MIME são obrigatórios para processar a fatura.",
        });
        return;
      }

      // 1. Cria um arquivo temporário no workspace para o script Python ler
      const tempDir = path.join(process.cwd(), "temp_uploads");
      if (!existsSync(tempDir)) {
        await fs.mkdir(tempDir, { recursive: true });
      }

      const fileExt = mimeType === "application/pdf" ? ".pdf" : ".png";
      const tempFilePath = path.join(tempDir, `invoice_${Date.now()}${fileExt}`);
      
      // Salva o buffer base64 para o disco
      const buffer = Buffer.from(fileBase64, "base64");
      await fs.writeFile(tempFilePath, buffer);

      // 2. Executa o script Python parser.py localmente usando execFile seguro (sem interpolação de shell)
      const { execFile } = require("child_process");
      const scriptPath = path.join(process.cwd(), "microservices", "invoice_parser", "parser.py");
      
      const runPython = (script: string, args: string[]): Promise<string> => {
        return new Promise((resolve, reject) => {
          execFile("python", [script, ...args], (error: any, stdout: string, stderr: string) => {
            if (error) {
              reject(new Error(stderr || error.message));
            } else {
              resolve(stdout);
            }
          });
        });
      };

      let pythonOutput = "";
      try {
        pythonOutput = await runPython(scriptPath, [tempFilePath]);
      } finally {
        // Garante a remoção do arquivo temporário mesmo em caso de falha
        try {
          await fs.unlink(tempFilePath);
        } catch (_) {}
      }

      // 3. Estrutura a resposta
      const parsedData = JSON.parse(pythonOutput);

      if (parsedData.error) {
        throw new Error(parsedData.error);
      }

      // Achata a lista de compras agrupadas por portador para a estrutura esperada pelo frontend
      const flatPurchases: any[] = [];
      let purchaseIndex = 0;

      if (parsedData.lancamentos_por_portador) {
        for (const [portador, compras] of Object.entries(parsedData.lancamentos_por_portador)) {
          const list = compras as any[];
          for (const item of list) {
            const isInstallment = !!item.is_installment;
            const current = item.installment_current ? Number(item.installment_current) : undefined;
            const total = item.installment_total ? Number(item.installment_total) : undefined;
            const val = item.value ? Number(item.value) : 0;
            const totalVal = isInstallment && total ? val * total : val;

            // Deriva o ano dinamicamente a partir do mês de referência da fatura (sem hardcode de ano)
            const dayMonth = item.date ? item.date.split("/") : null;
            const formattedDate = dayMonth && dayMonth.length === 2 ? `${targetYear}-${dayMonth[1]}-${dayMonth[0]}` : undefined;

            flatPurchases.push({
              id: `pur-${Date.now()}-${purchaseIndex++}-${Math.random().toString(36).substr(2, 4)}`,
              description: item.description || item.descricao || "Compra Sem Nome",
              category: "Geral",
              purchaseDate: formattedDate,
              totalValue: Number(totalVal),
              isInstallment,
              installmentCurrent: current,
              installmentTotal: total,
              installmentValue: isInstallment ? Number(val) : undefined,
              installmentsRemaining: isInstallment && total && current ? total - current : undefined,
              portador: portador !== "OUTROS" ? portador : undefined, // Repassa metadado do portador se disponível
            });
          }
        }
      }

      const needsReview = flatPurchases.length === 0;

      const cardInvoice = {
        id: `inv-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        referenceMonth: refMonth,
        uploadedAt: new Date().toISOString(),
        fileName: fileName || "fatura.pdf",
        totalValue: Number(parsedData.valor_total || 0),
        purchases: flatPurchases,
        parsedAt: new Date().toISOString(),
        needsReview,
      };

      res.json({
        success: true,
        invoice: cardInvoice,
      });

    } catch (error: any) {
      console.error("Erro no processamento local da fatura:", error);
      res.status(500).json({
        success: false,
        error: error?.message || "Erro desconhecido ao processar fatura localmente.",
      });
    }
  });

  // API - Sincronização compartilhada simples
  const SYNC_DIR = path.join(process.cwd(), "sync_data");

  // Garante que o diretório de sincronização existe
  try {
    if (!existsSync(SYNC_DIR)) {
      await fs.mkdir(SYNC_DIR, { recursive: true });
    }
  } catch (err) {
    console.error("Erro ao criar diretório sync_data:", err);
  }

  // Sanitiza o código para evitar Path Traversal
  const sanitizeCode = (code: string) => {
    return code.replace(/[^a-zA-Z0-9_-]/g, "");
  };

  app.get("/api/sync/:code", async (req, res) => {
    try {
      const code = sanitizeCode(req.params.code);
      if (!code) {
        res.status(400).json({ success: false, error: "Código inválido." });
        return;
      }
      const filePath = path.join(SYNC_DIR, `data_${code}.json`);
      if (existsSync(filePath)) {
        const fileContent = await fs.readFile(filePath, "utf-8");
        res.json({ success: true, data: JSON.parse(fileContent) });
      } else {
        res.status(404).json({ success: false, error: "Nenhum dado encontrado para este código." });
      }
    } catch (error: any) {
      console.error("Erro ao buscar dados sincronizados:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/sync/:code", async (req, res) => {
    try {
      const code = sanitizeCode(req.params.code);
      if (!code) {
        res.status(400).json({ success: false, error: "Código inválido." });
        return;
      }
      const filePath = path.join(SYNC_DIR, `data_${code}.json`);
      await fs.writeFile(filePath, JSON.stringify(req.body, null, 2), "utf-8");
      res.json({ success: true });
    } catch (error: any) {
      console.error("Erro ao salvar dados de sincronização:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Configuração do Vite Middleware em desenvolvimento ou arquivos estáticos em produção
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

startServer();
