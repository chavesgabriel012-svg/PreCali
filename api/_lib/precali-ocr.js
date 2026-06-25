const { parseFinancialDocument } = require("./precali-documents");

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_VISION_MODEL = "llama-3.2-11b-vision-preview";
const REQUEST_TIMEOUT_MS = 18000;

function hasGroqKey() {
  return Boolean(process.env.GROQ_API_KEY);
}

function visionModel() {
  return process.env.GROQ_VISION_MODEL || process.env.GROQ_MODEL_VISION || DEFAULT_VISION_MODEL;
}

function mediaUrl(buffer, contentType) {
  const mime = String(contentType || "image/jpeg").split(";")[0] || "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function buildPrompt() {
  return [
    "Sos un lector OCR financiero para PreCali.",
    "Lee la imagen y extrae texto util para precalificar credito.",
    "No inventes datos. Si no ves un campo, omitilo.",
    "Responde SOLO texto plano, una linea por campo.",
    "",
    "Campos esperados si aparecen:",
    "Nombre:",
    "Cedula:",
    "Patrono:",
    "Salario neto:",
    "Salario bruto:",
    "Total deducciones:",
    "Deuda mensual:",
    "Producto:",
    "Prima:",
    "Valor bien:",
    "Observaciones:",
  ].join("\n");
}

async function callGroqVision(buffer, contentType) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: visionModel(),
        temperature: 0,
        max_tokens: 900,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: buildPrompt() },
              { type: "image_url", image_url: { url: mediaUrl(buffer, contentType) } },
            ],
          },
        ],
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      const error = new Error(`groq_vision_${response.status}`);
      error.body = raw.slice(0, 1000);
      throw error;
    }

    const data = JSON.parse(raw);
    return String(data?.choices?.[0]?.message?.content || "").trim();
  } finally {
    clearTimeout(timer);
  }
}

async function readImageFinancialDocument(buffer, contentType) {
  if (!buffer || !buffer.length) {
    return {
      ok: false,
      reason: "empty_image",
      message: "La imagen venia vacia.",
      extractedText: "",
    };
  }

  if (!hasGroqKey()) {
    return {
      ok: false,
      reason: "groq_key_missing",
      message: "Recibi la imagen, pero el OCR de fotos necesita GROQ_API_KEY configurada. Mandame PDF/DOCX/CSV con texto, o escribime los datos.",
      extractedText: "",
    };
  }

  try {
    const extractedText = await callGroqVision(buffer, contentType);
    const parsed = parseFinancialDocument(extractedText);
    const usefulText = extractedText.trim();
    return {
      ok: usefulText.length >= 15,
      type: "image",
      textLength: usefulText.length,
      extractedText: usefulText.slice(0, 12000),
      document: parsed.document,
      profile: parsed.profile,
      confidence: parsed.confidence || 0,
      notes: parsed.notes || [],
      warnings: parsed.warnings || [],
      preview: usefulText.slice(0, 600),
      message: usefulText.length >= 15
        ? ""
        : "Recibi la imagen, pero no pude leer texto financiero claro. Podes intentar otra foto mas nitida o escribir los datos.",
    };
  } catch (_error) {
    return {
      ok: false,
      reason: "groq_vision_failed",
      message: "Recibi la imagen, pero el OCR con IA fallo en este momento. Podes intentar otra vez o escribir ingreso, deudas y prima.",
      extractedText: "",
    };
  }
}

module.exports = {
  readImageFinancialDocument,
};
