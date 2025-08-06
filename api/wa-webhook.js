import crypto from "crypto";
import { parse as parseQS } from "querystring";

/* Utils */
const readRaw = req => new Promise((res, rej) => {
    let d = ""; req.on("data", c => d += c); req.on("end", () => res(d)); req.on("error", rej);
});
const sign = (token, url, params) => {
    const sorted = Object.keys(params).sort().map(k => k + params[k]).join("");
    return crypto.createHmac("sha1", token).update(url + sorted, "utf8").digest("base64");
};
const twiml = msg => `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${msg}</Message></Response>`;

/** Formata timestamp de SP sem depender de pt-BR/ICU.
 *  Usa en-US (sempre presente) + formatToParts.
 *  Resultado: dd/mm/yyyy HH:MM:SS (GMT-3)  */
function stampSP(date = new Date()) {
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Sao_Paulo",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false
    });
    const p = Object.fromEntries(fmt.formatToParts(date).map(x => [x.type, x.value]));
    // p.month (MM) p.day (DD) p.year (YYYY) p.hour (HH) p.minute (mm) p.second (ss)
    const s = `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
    // São Paulo está em GMT-3 (sem DST desde 2019). Se precisar dinâmico, calculamos offset.
    return `${s} GMT-3`;
}

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            res.setHeader("Allow", "POST");
            return res.status(405).end("Method Not Allowed");
        }

        const proto = req.headers["x-forwarded-proto"] || "https";
        const host  = req.headers["x-forwarded-host"] || req.headers.host;
        const publicUrl = `${proto}://${host}/api/wa-webhook`;

        const raw = await readRaw(req);
        const params = parseQS(raw || "");
        const body   = (params.Body || "").toString().trim();
        const from   = (params.From || "").toString();

        // DEV: pular verificação (NÃO use em prod)
        if (process.env.TWILIO_SKIP_VERIFY === "true") {
            const reply = `Recebido em ${stampSP()}. Você disse: "${body || "—"}" ✅`;
            console.log("DEV inbound:", { from, body });
            res.setHeader("Content-Type", "text/xml");
            return res.status(200).send(twiml(reply));
        }

        // Produção: valida assinatura
        const token = process.env.TWILIO_AUTH_TOKEN;
        if (!token) return res.status(500).send("Missing TWILIO_AUTH_TOKEN");

        const signature = req.headers["x-twilio-signature"];
        const expected  = sign(token, publicUrl, params);
        if (signature !== expected) return res.status(403).send("Invalid signature");

        const reply = `Recebido em ${stampSP()}. Você disse: "${body || "—"}" ✅`;
        console.log("Inbound:", { from, body });

        res.setHeader("Content-Type", "text/xml");
        return res.status(200).send(twiml(reply));
    } catch (err) {
        console.error("Webhook ERROR:", { msg: err?.message, stack: err?.stack });
        return res.status(500).send("Internal error");
    }
}
