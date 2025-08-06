// ESM - sem libs externas
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

/* Handler */
export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).end("Method Not Allowed");
    }

    // URL pública usada na assinatura
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host  = req.headers["x-forwarded-host"] || req.headers.host;
    const publicUrl = `${proto}://${host}/api/wa-webhook`;

    // Corpo x-www-form-urlencoded da Twilio
    const raw = await readRaw(req);
    const params = parseQS(raw || "");
    const body   = (params.Body || "").toString().trim();
    const from   = (params.From || "").toString();

    // DEV: pular verificação se quiser testar rápido (não use em prod)
    if (process.env.TWILIO_SKIP_VERIFY === "true") {
        const now = new Date();
        const stamp = new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "medium",
            timeZone: "America/Sao_Paulo",
            timeZoneName: "short"
        }).format(now);
        const reply = `Recebido em ${stamp}. Você disse: "${body || "—"}" ✅`;
        console.log("DEV inbound:", { from, body, stamp });
        res.setHeader("Content-Type", "text/xml");
        return res.status(200).send(twiml(reply));
    }

    // Verificação de assinatura (produção)
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!token) return res.status(500).send("Missing TWILIO_AUTH_TOKEN");
    const signature = req.headers["x-twilio-signature"];
    const expected  = sign(token, publicUrl, params);
    if (signature !== expected) return res.status(403).send("Invalid signature");

    // Monta resposta com data/hora de SP
    const now = new Date();
    const stamp = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium",
        timeZone: "America/Sao_Paulo",
        timeZoneName: "short"
    }).format(now);

    const reply = `Recebido em ${stamp}. Você disse: "${body || "—"}" ✅`;
    console.log("Inbound:", { from, body, stamp });

    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(twiml(reply));
}
