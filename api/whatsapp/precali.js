const { buildReply, buildReplyFromProfile } = require("../_lib/precali-whatsapp-bot");
const { analyzeWithPreCaliAi, shouldUseAiForMessage } = require("../_lib/precali-ai");
const { readPreCaliDocument } = require("../_lib/precali-documents");
const { fetchTwilioMedia } = require("../_lib/twilio-media");

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function twiml(message) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") {
      resolve("");
      return;
    }

    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function parseParams(req, rawBody) {
  if (req.body && typeof req.body === "object") return req.body;
  return Object.fromEntries(new URLSearchParams(rawBody || ""));
}

function money(value) {
  return "CRC " + Math.max(0, Math.round(Number(value) || 0)).toLocaleString("es-CR");
}

function localDocumentFallbackMessage(documentResult) {
  const base = [
    "Recibi tu documento, pero el lector local de PreCali no pudo sacar suficientes datos para calcular.",
  ];

  if (documentResult && documentResult.reason === "image_ocr_pending") {
    base.push("Por ahora leo PDF/DOCX/CSV con texto. Las fotos escaneadas ocupan OCR local, que es el siguiente paso.");
  } else if (documentResult && documentResult.reason === "legacy_doc_unsupported") {
    base.push("El archivo parece ser .doc antiguo. Guardalo como .docx o PDF con texto y mandamelo otra vez.");
  } else if (documentResult && documentResult.message) {
    base.push(documentResult.message);
  }

  base.push("");
  base.push("Tambien podes escribirme algo asi:");
  base.push("Gano 1500000, debo 250000, quiero vehiculo de 15000000, tengo 2000000 de prima, a 6 anos.");
  return base.join("\n");
}

async function buildReplyFromLocalDocument(input) {
  if (Number(input.numMedia || 0) <= 0 || !input.mediaUrl) return null;

  const media = await fetchTwilioMedia(input.mediaUrl);
  const documentResult = readPreCaliDocument(media.buffer, input.mediaType || media.contentType);

  if (documentResult.ok && documentResult.profile && documentResult.profile.income) {
    const prefixLines = ["Lector local PreCali: lei el documento sin IA."];
    const detected = [];
    for (const note of documentResult.notes || []) detected.push(note);
    if (documentResult.document && documentResult.document.strongObligations) {
      detected.push("Obligaciones fuertes detectadas: " + money(documentResult.document.strongObligations));
    }
    if (detected.length) prefixLines.push(detected.join(" | "));
    for (const warning of documentResult.warnings || []) prefixLines.push("Nota: " + warning);
    return buildReplyFromProfile(documentResult.profile, { prefixLines });
  }

  if (process.env.PRECALI_AI_DOCUMENT_FALLBACK === "1" && shouldUseAiForMessage(input)) {
    return null;
  }

  return { message: localDocumentFallbackMessage(documentResult) };
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true, name: "PreCali WhatsApp MVP" }));
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, POST");
    res.end("Method Not Allowed");
    return;
  }

  try {
    const rawBody = await readRawBody(req);
    const params = parseParams(req, rawBody);
    const input = {
      body: params.Body,
      from: params.From,
      to: params.To,
      numMedia: params.NumMedia,
      mediaUrl: params.MediaUrl0,
      mediaType: params.MediaContentType0,
    };

    let reply;
    if (Number(input.numMedia || 0) > 0 && input.mediaUrl) {
      try {
        reply = await buildReplyFromLocalDocument(input);
      } catch (documentError) {
        if (process.env.PRECALI_AI_DOCUMENT_FALLBACK !== "1") {
          reply = {
            message:
              "Recibi tu documento, pero no pude descargarlo desde Twilio para leerlo localmente. Revisa que TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN esten configurados, o escribime ingreso, deudas, monto, prima y plazo.",
          };
        }
      }
    }

    if (!reply && shouldUseAiForMessage(input)) {
      try {
        const ai = await analyzeWithPreCaliAi(input);
        const prefixLines = [];

        if (ai && ai.confidence >= 0.45) {
          prefixLines.push("IA PreCali: lei tu mensaje" + (Number(input.numMedia || 0) > 0 ? " y el documento" : "") + ".");

          if (ai.document && (ai.document.name || ai.document.idNumber || ai.document.employer || ai.document.netIncome)) {
            const detected = [];
            if (ai.document.name) detected.push("Nombre: " + ai.document.name);
            if (ai.document.idNumber) detected.push("Cedula: " + ai.document.idNumber);
            if (ai.document.employer) detected.push("Patrono: " + ai.document.employer);
            if (ai.document.netIncome) detected.push("Ingreso neto detectado: CRC " + ai.document.netIncome.toLocaleString("es-CR"));
            prefixLines.push(detected.join(" | "));
          }

          reply = buildReplyFromProfile(ai.profile, { prefixLines });
        }
      } catch (aiError) {
        reply = null;
      }
    }

    if (!reply) {
      reply = buildReply(input);
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/xml; charset=utf-8");
    res.end(twiml(reply.message));
  } catch (error) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/xml; charset=utf-8");
    res.end(twiml("PreCali tuvo un problema leyendo el mensaje. Probemos de nuevo con ingreso, deudas, monto, prima y plazo."));
  }
};
