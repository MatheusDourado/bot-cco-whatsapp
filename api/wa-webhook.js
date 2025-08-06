// api/wa-webhook.js
import crypto from "crypto";
import { parse as parseQS } from "querystring";

// Lê o corpo bruto (necessário p/ validar assinatura)
function readRawBody(req) {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", chunk => (data += chunk));
        req.on("end", () => resolve(data));
        req.on("error", reject);
    });
}

// Assinatura Twilio: HMAC-SHA1(base64) de (url + params ordenados)
function twilioSignature(token, url, paramsObj) {
    const sorted = Object.keys(paramsObj)
        .sort()
        .map(k => k + paramsObj[k])
        .join("");
    const data = url + sorted;
    return crypto.createHmac("sha1", token).update(data, "utf8").digest("base64");
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).end("Method Not Allowed");
    }

    // Monta a URL pública real que a Twilio usou
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const publicUrl = `${proto}://${host}/api/wa-webhook`;

    // Corpo bruto e params
    const raw = await readRawBody(req);
    const params = parseQS(raw || ""); // Twilio envia application/x-www-form-urlencoded

    // Validação de assinatura
    const signatureHeader = req.headers["x-twilio-signature"];
    const authToken = process.env.TWILIO_AUTH_TOKEN; // defina na Vercel
    if (!authToken) return res.status(500).send("Missing TWILIO_AUTH_TOKEN");

    const expected = twilioSignature(authToken, publicUrl, params);
    const valid = signatureHeader === expected;

    if (!valid) {
        // Dê log p/ inspeção
        console.warn("Invalid Twilio signature", { signatureHeader, expected, publicUrl });
        return res.status(403).send("Invalid signature");
    }

    // --- Daqui pra baixo é sua lógica ---
    const body = params.Body?.toString()?.trim() || "";
    const from = params.From || "";

    // Resposta imediata (TwiML) — Twilio envia de volta ao usuário
    const reply = body ? `Recebi: "${body}" ✅` : "Recebido! ✅";
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Message>${reply}</Message></Response>`;

    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(twiml);
}
