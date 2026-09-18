import { Boom } from "@hapi/boom";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";

import { config } from "./config";
import { log } from "./logger";
import type { Offer } from "./mercadolivre";

export interface GroupInfo {
  jid: string;
  name: string;
  members: number;
}

/**
 * Conexão com o WhatsApp via Baileys. A sessão fica salva em bot/auth/, então
 * o QR code só precisa ser lido na primeira vez (ou se o celular desconectar
 * o aparelho em "Dispositivos conectados").
 */
export class WhatsApp {
  private sock: WASocket | null = null;
  private ready = false;
  private closing = false;

  async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(config.paths.auth);
    const { version } = await fetchLatestBaileysVersion();

    await new Promise<void>((resolve, reject) => {
      const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        browser: Browsers.ubuntu("Chrome"),
        markOnlineOnConnect: false,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
      });
      this.sock = sock;

      sock.ev.on("creds.update", saveCreds);
      sock.ev.on("connection.update", (update) => {
        if (update.qr) {
          log.info("Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo:");
          qrcode.generate(update.qr, { small: true });
        }

        if (update.connection === "open") {
          this.ready = true;
          log.info(`WhatsApp conectado como ${sock.user?.id?.split(":")[0] ?? "?"}`);
          resolve();
        }

        if (update.connection === "close") {
          this.ready = false;
          if (this.closing) return;

          const code = (update.lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
          if (code === DisconnectReason.loggedOut) {
            const err = new Error(
              "Sessão encerrada pelo WhatsApp. Apague a pasta bot/auth e rode de novo para ler um novo QR code.",
            );
            log.error(err.message);
            reject(err);
            return;
          }

          // 515 (restartRequired) é normal logo depois de parear; os outros são quedas de rede.
          log.warn(`Conexão caiu (código ${code ?? "?"}). Reconectando em 3s...`);
          setTimeout(() => {
            this.connect()
              .then(resolve)
              .catch((err) => {
                log.error("Não consegui reconectar", err);
                reject(err);
              });
          }, 3000);
        }
      });
    });
  }

  async listGroups(): Promise<GroupInfo[]> {
    const groups = await this.socket().groupFetchAllParticipating();
    return Object.values(groups)
      .map((g) => ({ jid: g.id, name: g.subject, members: g.participants.length }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  /** Encontra o grupo configurado (GROUP_JID tem prioridade; GROUP_NAME busca por trecho). */
  async resolveGroup(): Promise<GroupInfo> {
    const groups = await this.listGroups();

    if (config.group.jid) {
      const found = groups.find((g) => g.jid === config.group.jid);
      if (found) return found;
      throw new Error(`GROUP_JID "${config.group.jid}" não é um grupo em que este número está.`);
    }

    if (!config.group.name) {
      throw new Error("Configure GROUP_NAME ou GROUP_JID no arquivo .env.");
    }

    const wanted = config.group.name.toLowerCase();
    const matches = groups.filter((g) => g.name.toLowerCase().includes(wanted));
    if (matches.length === 1) return matches[0]!;
    if (matches.length === 0) {
      throw new Error(
        `Nenhum grupo com "${config.group.name}" no nome. Grupos disponíveis:\n` +
          groups.map((g) => `  - ${g.name}`).join("\n"),
      );
    }
    throw new Error(
      `Mais de um grupo bate com "${config.group.name}". Use GROUP_JID para escolher:\n` +
        matches.map((g) => `  - ${g.name}  →  ${g.jid}`).join("\n"),
    );
  }

  /** Envia a oferta com foto; se a foto falhar, envia só o texto para não perder a postagem. */
  async sendOffer(jid: string, offer: Offer, caption: string): Promise<void> {
    await this.waitUntilReady();
    const sock = this.socket();

    if (offer.image) {
      try {
        await sock.sendMessage(jid, { image: { url: offer.image }, caption });
        return;
      } catch (err) {
        log.warn(`Não consegui enviar a foto de ${offer.id}, mandando só o texto. (${String(err)})`);
      }
    }
    await sock.sendMessage(jid, { text: caption });
  }

  async close(): Promise<void> {
    this.closing = true;
    this.sock?.end(undefined);
    this.sock = null;
    this.ready = false;
  }

  private socket(): WASocket {
    if (!this.sock) throw new Error("WhatsApp ainda não conectado — chame connect() antes.");
    return this.sock;
  }

  private async waitUntilReady(timeoutMs = 60_000): Promise<void> {
    const started = Date.now();
    while (!this.ready) {
      if (Date.now() - started > timeoutMs) {
        throw new Error("WhatsApp continua desconectado depois de 60s.");
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
