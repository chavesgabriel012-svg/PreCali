// ============================================================
// PreCali AI — Memoria de conversacion (hasta 30 dias)
// ============================================================
// Guarda el ESTADO COMPLETO de la conversacion por numero de
// telefono: en que paso del flujo guiado va, los datos ya
// recolectados (perfil), los ultimos resultados calculados, y un
// historial corto para que la IA pueda resolver dudas con
// contexto.
//
// Backend: Vercel KV / Upstash Redis (HTTP REST, sin SDK) si esta
// configurado (KV_REST_API_URL + KV_REST_API_TOKEN, que Vercel
// agrega automaticamente al instalar el addon "Upstash for
// Redis"/"Vercel KV"). Si no esta configurado, cae a memoria del
// proceso (se pierde al reiniciar la funcion) para que el bot
// siga funcionando igual mientras se configura.

const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 dias
const MAX_AI_HISTORY = 12; // mensajes recientes para la IA (no toda la conversacion)
const KEY_PREFIX = "precali:conv:";
const SESSION_VERSION = 2;

const VALID_STEPS = new Set([
  "inicio",
  "pedir_producto",
  "pedir_ingreso",
  "pedir_deudas",
  "pedir_prima",
  "post_resultado",
  "elegir_banco_aplicar",
  "elegir_banco_requisitos",
  "lead_datos",
  "lead_fuente_ingresos",
  "esperar_documentos",
  "autorizar_soft_precali",
  "confirmar_datos_extraidos",
  "corregir_datos_extraidos",
  "confirmar_hard_pull",
  "aplicado",
  "pausado",
]);

const DEFAULT_PROFILE = {
  country: "",
  currency: "",
  product: "",
  income: 0,
  debt: 0,
  downPayment: 0,
  assetValue: 0,
  requestedYears: 0,
};

const DEFAULT_LEAD = {
  fullName: "",
  idNumber: "",
  email: "",
  incomeSource: "",
  phoneOverride: "",
};

function kvUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
}

function kvToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
}

function kvConfigured() {
  return Boolean(kvUrl() && kvToken());
}

async function kvCommand(command) {
  const response = await fetch(kvUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kvToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`kv_${response.status}`);
  return response.json();
}

// ---------- Respaldo en memoria (si no hay KV configurado) ----------

const memoryStore = new Map();

function memoryCleanup() {
  const now = Date.now();
  for (const [key, value] of memoryStore.entries()) {
    if (!value || now - value.ts > TTL_SECONDS * 1000) memoryStore.delete(key);
  }
}

function memoryGet(phone) {
  memoryCleanup();
  const entry = memoryStore.get(phone);
  return entry ? entry.session : null;
}

function memorySet(phone, session) {
  memoryCleanup();
  memoryStore.set(phone, { session, ts: Date.now() });
}

function memoryDelete(phone) {
  memoryStore.delete(phone);
}

// ---------- API publica ----------

function defaultSession() {
  return {
    version: SESSION_VERSION,
    step: "inicio",
    profile: { ...DEFAULT_PROFILE },
    lastResults: null,
    targetBank: null,
    lead: { ...DEFAULT_LEAD },
    documentText: "",
    extractedSummary: "",
    correctionNote: "",
    aiHistory: [],
    updatedAt: Date.now(),
  };
}

function cleanNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function normalizeProfile(profile) {
  const source = profile && typeof profile === "object" ? profile : {};
  const merged = { ...DEFAULT_PROFILE, ...source };
  return {
    ...merged,
    country: String(merged.country || ""),
    currency: String(merged.currency || ""),
    product: String(merged.product || ""),
    income: cleanNumber(merged.income),
    debt: cleanNumber(merged.debt),
    downPayment: cleanNumber(merged.downPayment),
    assetValue: cleanNumber(merged.assetValue),
    requestedYears: cleanNumber(merged.requestedYears),
  };
}

function normalizeLead(lead) {
  const source = lead && typeof lead === "object" ? lead : {};
  const merged = { ...DEFAULT_LEAD, ...source };
  return {
    fullName: String(merged.fullName || ""),
    idNumber: String(merged.idNumber || ""),
    email: String(merged.email || ""),
    incomeSource: String(merged.incomeSource || ""),
    phoneOverride: String(merged.phoneOverride || ""),
  };
}

function normalizeSession(session) {
  const base = defaultSession();
  const source = session && typeof session === "object" ? session : {};
  const step = VALID_STEPS.has(source.step) ? source.step : base.step;
  const aiHistory = Array.isArray(source.aiHistory) ? source.aiHistory.slice(-MAX_AI_HISTORY) : [];
  const updatedAt = Number(source.updatedAt);

  return {
    ...base,
    ...source,
    version: SESSION_VERSION,
    step,
    profile: normalizeProfile(source.profile),
    lead: normalizeLead(source.lead),
    aiHistory,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : Date.now(),
  };
}

async function getSession(phone) {
  if (!phone) return defaultSession();
  const key = KEY_PREFIX + phone;

  if (kvConfigured()) {
    try {
      const data = await kvCommand(["GET", key]);
      if (data && data.result) {
        const parsed = JSON.parse(data.result);
        return normalizeSession(parsed);
      }
      return defaultSession();
    } catch (_error) {
      const fallback = memoryGet(phone);
      return fallback ? normalizeSession(fallback) : defaultSession();
    }
  }

  const fallback = memoryGet(phone);
  return fallback ? normalizeSession(fallback) : defaultSession();
}

async function saveSession(phone, session) {
  if (!phone) return;
  const toSave = normalizeSession({ ...session, updatedAt: Date.now() });
  const key = KEY_PREFIX + phone;

  if (kvConfigured()) {
    try {
      await kvCommand(["SETEX", key, TTL_SECONDS, JSON.stringify(toSave)]);
      return;
    } catch (_error) {
      // si KV falla, al menos guardamos en memoria de esta instancia
    }
  }

  memorySet(phone, toSave);
}

async function resetSession(phone) {
  if (!phone) return;
  const key = KEY_PREFIX + phone;
  if (kvConfigured()) {
    try {
      await kvCommand(["DEL", key]);
    } catch (_error) {
      // no-op
    }
  }
  memoryDelete(phone);
}

module.exports = {
  kvConfigured,
  defaultSession,
  normalizeSession,
  getSession,
  saveSession,
  resetSession,
};
