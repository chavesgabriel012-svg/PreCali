const { buildReply, buildReplyFromProfile, coerceProfile, parseProfile } = require("../_lib/precali-whatsapp-bot");
const { analyzeWithPreCaliAi, shouldUseAiForMessage } = require("../_lib/precali-ai");
const { readPreCaliDocument } = require("../_lib/precali-documents");
const { fetchTwilioMedia } = require("../_lib/twilio-media");

const CONTEXT_TTL_MS = 20 * 60 * 1000;
const recentTextContext = new Map();

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

function hasUsefulBodyText(body) {
  return String(body || "").trim().length >= 3;
}

function cleanupRecentContext() {
  const now = Date.now();
  for (const [key, value] of recentTextContext.entries()) {
    if (!value || now - value.ts > CONTEXT_TTL_MS) recentTextContext.delete(key);
  }
}

function rememberRecentText(from, body) {
  if (!from || !hasUsefulBodyText(body)) return;
  cleanupRecentContext();
  const key = String(from);
  const current = recentTextContext.get(key) || {};
  recentTextContext.set(key, {
    ...current,
    body: String(body).trim(),
    ts: Date.now(),
  });
}

function readRecentText(from) {
  if (!from) return "";
  cleanupRecentContext();
  const entry = recentTextContext.get(String(from));
  if (!entry) return "";
  return entry.body || "";
}

function rememberRecentProfile(from, profile, body) {
  if (!from || !profile) return;
  cleanupRecentContext();
  const key = String(from);
  const current = recentTextContext.get(key) || {};
  recentTextContext.set(key, {
    ...current,
    body: hasUsefulBodyText(body) ? String(body).trim() : current.body,
    profile: coerceProfile(profile),
    ts: Date.now(),
  });
}

function readRecentProfile(from) {
  if (!from) return null;
  cleanupRecentContext();
  const entry = recentTextContext.get(String(from));
  return entry && entry.profile ? entry.profile : null;
}

function money(value) {
  return "CRC " + Math.max(0, Math.round(Number(value) || 0)).toLocaleString("es-CR");
}

function productLabel(product) {
  if (product === "hipoteca") return "credito hipotecario";
  if (product === "vehiculo") return "credito vehicular";
  return "credito personal";
}

function normalizeForIntent(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function explicitProductFromBody(body) {
  const text = normalizeForIntent(body);
  if (/(casa|vivienda|hipoteca|hipotecario|apartamento|apto|lote|terreno|propiedad|inmueble)/.test(text)) return "hipoteca";
  if (/(carro|auto|vehiculo|veiculo|vehicular|moto|prendario|pickup|pick up|camioneta)/.test(text)) return "vehiculo";
  if (/(personal|consumo|libre inversion|gastos personales)/.test(text)) return "personal";
  return "";
}

function bodyHasYearHint(body) {
  return /(\d{1,2})\s*(?:anos|ano|anios|años|año|plazo)|plazo.{0,24}\d{1,2}/.test(normalizeForIntent(body));
}

function defaultYearsForProduct(product) {
  return product === "hipoteca" ? 30 : product === "vehiculo" ? 6 : 5;
}

function bodyHasDebtZeroHint(body) {
  return /\b(no debo|sin deudas?|deuda cero|deudas? en 0)\b/.test(normalizeForIntent(body));
}

function mergeDocumentAndMessageProfile(documentProfile, body) {
  const doc = documentProfile || {};
  const bodyProfile = parseProfile(body || "");
  const productHint = explicitProductFromBody(body);
  const notes = [];

  const merged = {
    product: productHint || doc.product || bodyProfile.product || "personal",
    income: Number(doc.income) || Number(bodyProfile.income) || 0,
    debt: Math.max(Number(doc.debt) || 0, bodyProfile.debt >= 10000 ? Number(bodyProfile.debt) || 0 : 0),
    downPayment: bodyProfile.downPayment >= 10000 ? bodyProfile.downPayment : Number(doc.downPayment) || 0,
    assetValue: bodyProfile.assetValue >= 100000 ? bodyProfile.assetValue : Number(doc.assetValue) || 0,
    requestedYears: bodyHasYearHint(body) ? bodyProfile.requestedYears : doc.requestedYears,
  };

  if (productHint && productHint !== doc.product) notes.push("producto");
  if (bodyHasYearHint(body)) notes.push("plazo");
  if (bodyProfile.assetValue >= 100000) notes.push("monto");
  if (bodyProfile.downPayment >= 10000) notes.push("prima");
  if (bodyProfile.debt >= 10000) notes.push("deudas");

  return { profile: merged, usedMessageHints: notes };
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

function buildContextBody(input) {
  const current = String((input && input.body) || "").trim();
  const remembered = readRecentText(input && input.from);
  if (current && remembered && normalizeForIntent(current) !== normalizeForIntent(remembered)) {
    return remembered + "\n" + current;
  }
  return current || remembered || "";
}

function shouldUseRememberedProfile(input, rememberedProfile) {
  if (!rememberedProfile || !rememberedProfile.income || Number(input && input.numMedia ? input.numMedia : 0) > 0) return false;
  const body = String((input && input.body) || "").trim();
  if (!body) return false;
  const normalized = normalizeForIntent(body);
  const hasFollowUpCue = /^(y|si|y si)\b/.test(normalized) || /\b(ahora|mas bien|mejor|entonces)\b/.test(normalized);

  if (/(^|\b)(hola|buenas|menu|ayuda|inicio|empezar|hey|ola|aplicar|solicitar|me interesa|quiero esa|enviar|mandar|estado|aprobado|rechazado|seguimiento)\b/.test(normalized)) {
    return false;
  }

  const current = parseProfile(body);
  if (current.income) return hasFollowUpCue;
  if (current.downPayment >= 10000 || current.assetValue >= 100000 || current.debt >= 10000) return true;
  if (bodyHasDebtZeroHint(body)) return true;
  if (explicitProductFromBody(body)) return true;
  if (bodyHasYearHint(body)) return true;
  return hasFollowUpCue || /\b(con|para|prima|monto|valor|plazo|anos|ano|carro|casa|vehiculo|hipoteca|deuda|deudas|cuota)\b/.test(normalized);
}

function mergeRememberedProfileWithBody(rememberedProfile, body) {
  const remembered = coerceProfile(rememberedProfile);
  const current = parseProfile(body || "");
  const explicitProduct = explicitProductFromBody(body);
  const product = explicitProduct || remembered.product || current.product || "personal";
  const productChanged = product !== remembered.product;
  const notes = [];

  const merged = {
    product,
    income: current.income || remembered.income || 0,
    debt: bodyHasDebtZeroHint(body) ? 0 : current.debt >= 10000 ? current.debt : remembered.debt || 0,
    downPayment: current.downPayment >= 10000 ? current.downPayment : remembered.downPayment || 0,
    assetValue: current.assetValue >= 100000 ? current.assetValue : productChanged ? 0 : remembered.assetValue || 0,
    requestedYears: bodyHasYearHint(body) ? current.requestedYears : productChanged ? defaultYearsForProduct(product) : remembered.requestedYears || defaultYearsForProduct(product),
  };

  if (productChanged) notes.push("producto");
  if (current.income) notes.push("ingreso");
  if (current.assetValue >= 100000) notes.push("monto");
  if (current.downPayment >= 10000) notes.push("prima");
  if (current.debt >= 10000 || bodyHasDebtZeroHint(body)) notes.push("deudas");
  if (bodyHasYearHint(body)) notes.push("plazo");

  return { profile: merged, usedMessageHints: notes };
}

async function buildReplyFromLocalDocument(input) {
  if (Number(input.numMedia || 0) <= 0 || !input.mediaUrl) return null;

  const media = await fetchTwilioMedia(input.mediaUrl);
  const documentResult = readPreCaliDocument(media.buffer, input.mediaType || media.contentType);

  if (documentResult.ok && documentResult.profile && documentResult.profile.income) {
    const contextBody = buildContextBody(input);
    const merged = mergeDocumentAndMessageProfile(documentResult.profile, contextBody);
    const prefixLines = ["Ya leí tu documento."];
    const detected = [];
    for (const note of documentResult.notes || []) {
      if (merged.usedMessageHints.includes("producto") && /^Producto detectado:/i.test(note)) continue;
      detected.push(note);
    }
    if (merged.usedMessageHints.length) detected.push("Tomé en cuenta tu mensaje para: " + merged.usedMessageHints.join(", "));
    if (contextBody && !String(input.body || "").trim() && readRecentText(input.from)) {
      detected.push("También tomé en cuenta tu mensaje anterior.");
    }
    if (merged.usedMessageHints.includes("producto")) detected.push("Producto final: " + productLabel(merged.profile.product));
    if (documentResult.document && documentResult.document.strongObligations) {
      detected.push("Obligaciones fuertes detectadas: " + money(documentResult.document.strongObligations));
    }
    if (detected.length) prefixLines.push(detected.join(" | "));
    for (const warning of documentResult.warnings || []) prefixLines.push("Nota: " + warning);
    rememberRecentProfile(input.from, merged.profile, contextBody);
    return buildReplyFromProfile(merged.profile, { prefixLines });
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

    if (hasUsefulBodyText(input.body) && Number(input.numMedia || 0) <= 0) {
      rememberRecentText(input.from, input.body);
    }

    let reply;
    let usedRememberedProfile = false;
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

    const rememberedProfile = readRecentProfile(input.from);
    if (!reply && shouldUseRememberedProfile(input, rememberedProfile)) {
      const merged = mergeRememberedProfileWithBody(rememberedProfile, input.body);
      const prefixLines = ["Recalculé con lo nuevo que me dijiste."];
      if (merged.usedMessageHints.length) {
        prefixLines.push("Actualicé: " + merged.usedMessageHints.join(", ") + ".");
      }
      rememberRecentProfile(input.from, merged.profile, buildContextBody(input));
      usedRememberedProfile = true;
      reply = buildReplyFromProfile(merged.profile, { prefixLines });
    }

    if (!reply && shouldUseAiForMessage(input)) {
      try {
        const ai = await analyzeWithPreCaliAi(input);
        const prefixLines = [];

        if (ai && ai.confidence >= 0.45) {
          prefixLines.push("Ya entendí tu mensaje" + (Number(input.numMedia || 0) > 0 ? " y el documento" : "") + ".");

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

    if (!usedRememberedProfile && hasUsefulBodyText(input.body) && Number(input.numMedia || 0) <= 0) {
      const parsed = parseProfile(input.body);
      if (parsed.income) {
        rememberRecentProfile(input.from, parsed, input.body);
      }
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
