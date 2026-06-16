const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_MEDIA_BYTES = 7 * 1024 * 1024;

function hasOpenAiKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function aiEnabled() {
  return hasOpenAiKey() && process.env.PRECALI_AI_DISABLED !== "1";
}

function shouldUseAiForMessage(input) {
  if (!aiEnabled()) return false;

  const numMedia = Number(input && input.numMedia ? input.numMedia : 0);
  if (numMedia > 0) return process.env.PRECALI_AI_DOCUMENT_FALLBACK === "1";

  if (process.env.PRECALI_AI_TEXT !== "1") return false;

  const body = String(input && input.body ? input.body : "").trim();
  if (body.length < 18) return false;
  if (/^(hola|buenas|menu|ayuda|inicio|empezar|hey|ola)$/i.test(body)) return false;

  return true;
}

function safeJsonParse(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch (_) {
    const match = String(value).match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (error) {
      return null;
    }
  }
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}

function normalizeProduct(value) {
  const product = String(value || "").toLowerCase();
  if (product === "vehiculo" || product === "personal" || product === "hipoteca") return product;
  return null;
}

function normalizeAiResult(result) {
  const profile = result && result.profile ? result.profile : {};
  const document = result && result.document ? result.document : {};

  return {
    profile: {
      product: normalizeProduct(profile.product),
      income: normalizeNumber(profile.income),
      debt: normalizeNumber(profile.debt),
      downPayment: normalizeNumber(profile.downPayment),
      assetValue: normalizeNumber(profile.assetValue),
      requestedYears: normalizeNumber(profile.requestedYears),
    },
    document: {
      type: document.type ? String(document.type) : null,
      name: document.name ? String(document.name) : null,
      idNumber: document.idNumber ? String(document.idNumber) : null,
      employer: document.employer ? String(document.employer) : null,
      grossIncome: normalizeNumber(document.grossIncome),
      netIncome: normalizeNumber(document.netIncome),
    },
    confidence: Math.max(0, Math.min(1, Number(result && result.confidence ? result.confidence : 0))),
    missing: Array.isArray(result && result.missing) ? result.missing.map(String).slice(0, 8) : [],
    notes: result && result.notes ? String(result.notes).slice(0, 500) : "",
  };
}

function buildSchema() {
  const nullableNumber = {
    anyOf: [{ type: "number" }, { type: "null" }],
  };
  const nullableString = {
    anyOf: [{ type: "string" }, { type: "null" }],
  };

  return {
    type: "object",
    additionalProperties: false,
    required: ["profile", "document", "confidence", "missing", "notes"],
    properties: {
      profile: {
        type: "object",
        additionalProperties: false,
        required: ["product", "income", "debt", "downPayment", "assetValue", "requestedYears"],
        properties: {
          product: {
            anyOf: [{ type: "string", enum: ["personal", "vehiculo", "hipoteca"] }, { type: "null" }],
          },
          income: nullableNumber,
          debt: nullableNumber,
          downPayment: nullableNumber,
          assetValue: nullableNumber,
          requestedYears: nullableNumber,
        },
      },
      document: {
        type: "object",
        additionalProperties: false,
        required: ["type", "name", "idNumber", "employer", "grossIncome", "netIncome"],
        properties: {
          type: nullableString,
          name: nullableString,
          idNumber: nullableString,
          employer: nullableString,
          grossIncome: nullableNumber,
          netIncome: nullableNumber,
        },
      },
      confidence: { type: "number" },
      missing: {
        type: "array",
        items: { type: "string" },
      },
      notes: { type: "string" },
    },
  };
}

function buildExtractionPrompt(body, mediaType) {
  return [
    "Sos el extractor de datos de PreCali para pre-calificacion financiera en Latinoamerica.",
    "Extrae solamente datos que aparezcan en el mensaje o documento. No inventes montos.",
    "Puede venir texto desordenado, con faltas de ortografia, orden patronal, boleta de pago, colilla, estado de cuenta, proforma, foto o PDF.",
    "Usa salario/ingreso NETO si existe. Si solo existe salario bruto, ponlo en grossIncome y usa income solo si el documento indica neto o liquido.",
    "No trates rebajos legales de planilla como deudas mensuales, excepto si aparecen como prestamos, cuotas, embargos, pension u obligaciones recurrentes.",
    "Producto: hipoteca para casa/vivienda/lote/terreno/propiedad; vehiculo para carro/auto/moto; personal para prestamo personal o si no hay garantia.",
    "Moneda base para este MVP: CRC. Devuelve numeros puros, sin simbolos ni separadores.",
    "Si hay documento adjunto, clasificalo y extrae nombre, cedula, patrono, ingreso bruto y neto cuando se pueda.",
    "",
    "Mensaje de WhatsApp:",
    body || "(sin texto)",
    "",
    "Tipo de archivo adjunto:",
    mediaType || "(sin adjunto)",
  ].join("\n");
}

async function fetchTwilioMedia(url) {
  if (!url) return null;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("twilio_media_auth_missing");
  }

  const response = await fetch(url, {
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
    },
  });

  if (!response.ok) {
    throw new Error(`twilio_media_fetch_${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > MAX_MEDIA_BYTES) {
    throw new Error("twilio_media_too_large");
  }

  return {
    buffer,
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}

function mediaContentPart(media, fallbackType) {
  if (!media || !media.buffer) return null;

  const contentType = (media.contentType || fallbackType || "application/octet-stream").split(";")[0].toLowerCase();
  const base64 = media.buffer.toString("base64");

  if (contentType.startsWith("image/")) {
    return {
      type: "input_image",
      image_url: `data:${contentType};base64,${base64}`,
    };
  }

  return {
    type: "input_file",
    filename: `precali-document.${extensionForContentType(contentType)}`,
    file_data: `data:${contentType};base64,${base64}`,
  };
}

function extensionForContentType(contentType) {
  if (contentType.includes("pdf")) return "pdf";
  if (contentType.includes("wordprocessingml")) return "docx";
  if (contentType.includes("msword")) return "doc";
  if (contentType.includes("csv")) return "csv";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  return "bin";
}

function outputTextFromResponse(data) {
  if (typeof data.output_text === "string") return data.output_text;

  const texts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") texts.push(content.text);
    }
  }
  return texts.join("\n");
}

async function callOpenAi({ body, mediaUrl, mediaType, numMedia }) {
  const content = [
    {
      type: "input_text",
      text: buildExtractionPrompt(body, mediaType),
    },
  ];

  if (Number(numMedia || 0) > 0 && mediaUrl) {
    const media = await fetchTwilioMedia(mediaUrl);
    const mediaPart = mediaContentPart(media, mediaType);
    if (mediaPart) content.push(mediaPart);
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      input: [
        {
          role: "user",
          content,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "precali_extraction",
          strict: true,
          schema: buildSchema(),
        },
      },
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    const error = new Error(`openai_${response.status}`);
    error.status = response.status;
    error.body = raw.slice(0, 1000);
    throw error;
  }

  const data = safeJsonParse(raw);
  const outputText = outputTextFromResponse(data || {});
  const parsed = safeJsonParse(outputText);
  if (!parsed) throw new Error("openai_invalid_json");

  return normalizeAiResult(parsed);
}

async function analyzeWithPreCaliAi(input) {
  if (!shouldUseAiForMessage(input)) return null;
  return callOpenAi(input);
}

module.exports = {
  aiEnabled,
  shouldUseAiForMessage,
  analyzeWithPreCaliAi,
  normalizeAiResult,
};
