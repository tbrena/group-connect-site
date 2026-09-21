import { createServerFn } from "@tanstack/react-start";

import { GITHUB_REPO, OFERTAS_WORKFLOW } from "@/lib/ofertas";

export type ResultadoAtualizacao =
  { ok: true; modo: "local" | "github" } | { ok: false; motivo: string; semToken?: boolean };

/**
 * Botão "Puxar novas ofertas" em /promo.
 *
 * O site publicado roda em Cloudflare Workers, sem disco e com limite de
 * requisições por chamada — não dá para rodar o bot ali. Em produção,
 * disparamos o workflow do GitHub Actions (.github/workflows/ofertas.yml),
 * que roda o bot, commita public/ofertas.json e o Lovable republica o site.
 * Em desenvolvimento, rodamos o script direto na máquina.
 */
export const atualizarOfertas = createServerFn({ method: "POST" }).handler(
  async (): Promise<ResultadoAtualizacao> => {
    if (import.meta.env.DEV) return rodarLocal();
    // Em produção o bot roda sozinho (cron-job.org a cada 30 min). Esta função é pública
    // (qualquer visitante poderia chamá-la); não pode ser um gatilho de posts forçados.
    return {
      ok: false,
      motivo: "atualização manual desativada em produção — o bot roda sozinho a cada 30 min",
    };
  },
);

async function rodarLocal(): Promise<ResultadoAtualizacao> {
  const { spawn } = await import("node:child_process");
  // Bun (sandbox do Lovable) roda .ts e carrega o .env sozinho; Node precisa das flags.
  const args = process.versions["bun"]
    ? ["scripts/ofertas/run.ts", "--so-site"]
    : ["--env-file-if-exists=.env", "scripts/ofertas/run.ts", "--so-site"];

  return new Promise((resolve) => {
    const proc = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "inherit", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    proc.on("error", (err) => resolve({ ok: false, motivo: err.message }));
    proc.on("close", (code) => {
      if (code === 0) return resolve({ ok: true, modo: "local" });
      const ultimaLinha = stderr.trim().split("\n").at(-1) ?? "";
      resolve({ ok: false, motivo: ultimaLinha || `o bot saiu com código ${code}` });
    });
  });
}

// Mantida para o dia em que houver um segredo no servidor; hoje não é chamada.
export async function dispararWorkflow(): Promise<ResultadoAtualizacao> {
  // Token fine-grained com permissão "Actions: read and write" neste repositório.
  const token = process.env["GITHUB_TOKEN"];
  if (!token) {
    return { ok: false, motivo: "GITHUB_TOKEN não configurado no servidor", semToken: true };
  }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${OFERTAS_WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "preco-ninja-site",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  );
  if (res.status === 204) return { ok: true, modo: "github" };
  const detalhe = (await res.text()).slice(0, 200);
  return { ok: false, motivo: `GitHub respondeu ${res.status}: ${detalhe}` };
}
