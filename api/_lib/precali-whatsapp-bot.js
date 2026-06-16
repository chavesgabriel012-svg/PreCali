const BANKS = [
  {
    id: "bac",
    name: "BAC Credomatic",
    vehiculo: { rate: 9.25, maxYears: 8, ratio: 0.32, minIncome: 750000, minAmount: 5000000, finance: 0.85 },
    personal: { rate: 18.0, maxYears: 5, ratio: 0.32, minIncome: 500000, minAmount: 500000 },
    hipoteca: { rate: 9.5, maxYears: 30, ratio: 0.35, minIncome: 750000, minAmount: 10000000, finance: 0.85 },
  },
  {
    id: "bn",
    name: "Banco Nacional",
    vehiculo: { rate: 8.9, maxYears: 8, ratio: 0.4, minIncome: 400000, minAmount: 2000000, finance: 0.85 },
    personal: { rate: 16.57, maxYears: 8, ratio: 0.4, minIncome: 400000, minAmount: 500000 },
    hipoteca: { rate: 9.0, maxYears: 30, ratio: 0.35, minIncome: 600000, minAmount: 5000000, finance: 0.9 },
  },
  {
    id: "davibank",
    name: "DaviBank",
    vehiculo: { rate: 8.95, maxYears: 8, ratio: 0.32, minIncome: 650000, minAmount: 3000000, finance: 0.9 },
    personal: { rate: 19.0, maxYears: 5, ratio: 0.32, minIncome: 500000, minAmount: 500000 },
  },
  {
    id: "promerica",
    name: "Promerica",
    vehiculo: { rate: 8.25, maxYears: 8, ratio: 0.33, minIncome: 600000, minAmount: 2500000, finance: 0.85 },
    hipoteca: { rate: 12.0, maxYears: 30, ratio: 0.35, minIncome: 750000, minAmount: 10000000, finance: 0.85 },
  },
  {
    id: "lafise",
    name: "Lafise",
    vehiculo: { rate: 10.5, maxYears: 7, ratio: 0.4, minIncome: 600000, minAmount: 2000000, finance: 0.85 },
    personal: { rate: 24.0, maxYears: 5, ratio: 0.35, minIncome: 500000, minAmount: 500000 },
    hipoteca: { rate: 10.0, maxYears: 30, ratio: 0.35, minIncome: 700000, minAmount: 8000000, finance: 0.8 },
  },
];

const AMOUNT_PATTERN = /([\d.,]+(?:\s*(?:millones|millon|mill|mil|k|m))?)/;

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeAmountWords(text) {
  const millions = {
    medio: 0.5,
    media: 0.5,
    un: 1,
    uno: 1,
    una: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
  };
  const thousands = {
    cien: 100,
    ciento: 100,
    doscientos: 200,
    trescientos: 300,
    cuatrocientos: 400,
    quinientos: 500,
    seiscientos: 600,
    setecientos: 700,
    ochocientos: 800,
    novecientos: 900,
  };

  let result = text;
  for (const [word, value] of Object.entries(millions)) {
    result = result.replace(new RegExp("\\b" + word + "\\s+(?:millon|millones)\\b", "g"), value + " millones");
  }
  for (const [word, value] of Object.entries(thousands)) {
    result = result.replace(new RegExp("\\b" + word + "\\s+mil\\b", "g"), value + " mil");
  }
  return result;
}

function normalizeTypos(text) {
  return text
    .replace(/\bkiero\b/g, "quiero")
    .replace(/\bqiero\b/g, "quiero")
    .replace(/\bnesecito\b/g, "necesito")
    .replace(/\bnesesito\b/g, "necesito")
    .replace(/\bkasa\b/g, "casa")
    .replace(/\bveiculo\b/g, "vehiculo")
    .replace(/\bveiculos\b/g, "vehiculos")
    .replace(/\bpreztamo\b/g, "prestamo")
    .replace(/\bhipotekario\b/g, "hipotecario");
}

function money(value) {
  const rounded = Math.max(0, Math.round(Number(value) || 0));
  return "CRC " + rounded.toLocaleString("es-CR");
}

function parseAmount(raw) {
  if (!raw) return 0;

  const compact = String(raw).toLowerCase().replace(/[,\s]/g, "");
  const number = Number(compact.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(number)) return 0;

  if (/millones|millon|mill|m\b/.test(compact)) return number * 1000000;
  if (/mil|k\b/.test(compact)) return number * 1000;
  return number;
}

function hasWrittenAmountCue(text) {
  return /\b\d[\d.,]*\b/.test(text) || /\b(medio|media|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos)\s+(millones|millon|mill|mil|k|m)\b/.test(text);
}

function findAmount(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseAmount(match[1]);
  }
  return 0;
}

function amountAfter(text, labels, blockers) {
  for (const label of labels) {
    const matcher = new RegExp("\\b(?:" + label + ")\\b", "g");
    let labelMatch;

    while ((labelMatch = matcher.exec(text))) {
      const segment = text.slice(labelMatch.index + labelMatch[0].length, labelMatch.index + labelMatch[0].length + 60);
      const amountMatch = segment.match(AMOUNT_PATTERN);
      if (!amountMatch) continue;

      const beforeAmount = segment.slice(0, amountMatch.index || 0);
      const blocked = blockers.some((blocker) => new RegExp("\\b(?:" + blocker + ")\\b").test(beforeAmount));
      if (!blocked) return parseAmount(amountMatch[1]);
    }
  }

  return 0;
}

function detectProduct(text) {
  if (/(casa|vivienda|hipoteca|hipotecario|apartamento|apto|lote|terreno|propiedad|inmueble)/.test(text)) {
    return "hipoteca";
  }
  if (/(carro|auto|vehiculo|veiculo|vehicular|moto|prendario|pickup|pick up|camioneta)/.test(text)) {
    return "vehiculo";
  }
  return "personal";
}

function parseProfile(body) {
  const text = normalizeTypos(normalizeAmountWords(normalize(body)));
  const product = detectProduct(text);

  const income =
    amountAfter(
      text,
      ["gano", "ganamos", "ingreso", "ingresos", "salario", "sueldo", "neto", "devengo"],
      ["debo", "deuda", "deudas", "pago", "pagos", "cuotas", "prima", "enganche", "aporte", "carro", "auto", "vehiculo", "veiculo", "casa", "vivienda", "monto", "valor"]
    ) ||
    findAmount(text, [
      /([\d.,]+(?:\s*(?:millones|millon|mill|mil|k|m))?)\s*(?:de ingreso|de salario|netos|mensuales)/,
    ]);

  const debt =
    /(no debo|sin deudas?|deuda cero)/.test(text)
      ? 0
      : amountAfter(
          text,
          ["debo", "debemos", "deuda", "deudas", "pago", "pagos", "cuotas", "rebajos"],
          ["gano", "ingreso", "ingresos", "salario", "sueldo", "neto", "prima", "enganche", "aporte", "carro", "auto", "vehiculo", "veiculo", "casa", "vivienda", "monto", "valor", "tengo"]
        ) ||
        findAmount(text, [
          /([\d.,]+(?:\s*(?:millones|millon|mill|mil|k|m))?)\s*(?:de deuda|en deudas|de pagos|en pagos)/,
        ]);

  const downPayment =
    amountAfter(
      text,
      ["prima", "enganche", "aporte"],
      ["debo", "deuda", "deudas", "pago", "pagos", "cuotas", "gano", "ingreso", "salario", "sueldo", "monto", "valor"]
    ) ||
    findAmount(text, [
      /([\d.,]+(?:\s*(?:millones|millon|mill|mil|k|m))?)\s*(?:de\s+)?(?:prima|enganche|aporte)\b/,
    ]) ||
    0;

  const rawAssetValue =
    amountAfter(
      text,
      ["valor", "monto", "hipoteca", "hipotecario", "casa", "vivienda", "propiedad", "apartamento", "apto", "lote", "terreno", "carro", "auto", "vehiculo", "veiculo", "prestamo", "credito", "financiar", "financiamiento", "ocupo", "necesito", "nesesito"],
      ["gano", "ingreso", "ingresos", "salario", "sueldo", "neto", "devengo", "debo", "deuda", "deudas", "pago", "pagos", "cuotas", "prima", "enganche", "aporte"]
    );
  const assetValue = rawAssetValue >= 100000 ? rawAssetValue : 0;

  const yearsMatch = text.match(/(\d{1,2})\s*(?:anos|ano|anios|meses|plazo)/);
  const defaultYears = product === "hipoteca" ? 30 : product === "personal" ? 5 : 6;
  const requestedYears = yearsMatch ? Number(yearsMatch[1]) : defaultYears;

  return {
    product,
    income,
    debt,
    downPayment,
    assetValue,
    requestedYears: Math.max(1, Math.min(requestedYears || defaultYears, 30)),
  };
}

function coerceProfile(profile) {
  const source = profile || {};
  const product = ["personal", "vehiculo", "hipoteca"].includes(source.product) ? source.product : "personal";
  const defaultYears = product === "hipoteca" ? 30 : product === "personal" ? 5 : 6;

  return {
    product,
    income: Math.max(0, Math.round(Number(source.income) || 0)),
    debt: Math.max(0, Math.round(Number(source.debt) || 0)),
    downPayment: Math.max(0, Math.round(Number(source.downPayment) || 0)),
    assetValue: Math.max(0, Math.round(Number(source.assetValue) || 0)),
    requestedYears: Math.max(1, Math.min(Math.round(Number(source.requestedYears) || defaultYears), 30)),
  };
}

function paymentFor(amount, annualRate, years) {
  const months = Math.max(1, Math.round(years * 12));
  const monthlyRate = annualRate / 100 / 12;
  if (!monthlyRate) return amount / months;
  return amount * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -months)));
}

function amountForPayment(payment, annualRate, years) {
  const months = Math.max(1, Math.round(years * 12));
  const monthlyRate = annualRate / 100 / 12;
  if (!monthlyRate) return payment * months;
  return payment * ((1 - Math.pow(1 + monthlyRate, -months)) / monthlyRate);
}

function simulate(profile) {
  const results = [];

  for (const bank of BANKS) {
    const condition = bank[profile.product];
    if (!condition) continue;

    const years = Math.min(profile.requestedYears, condition.maxYears);
    const capacity = Math.max(0, profile.income * condition.ratio - profile.debt);
    let amount = amountForPayment(capacity, condition.rate, years);

    if (profile.assetValue && profile.product !== "personal") {
      const financeLimit = profile.assetValue * (condition.finance || 0.85);
      const requested = Math.max(0, profile.assetValue - profile.downPayment);
      amount = Math.min(amount, financeLimit, requested || financeLimit);
    }

    const qualifies = profile.income >= condition.minIncome && amount >= condition.minAmount && capacity > 0;
    if (!qualifies) continue;

    const payment = paymentFor(amount, condition.rate, years);
    results.push({
      bank: bank.name,
      rate: condition.rate,
      years,
      amount,
      payment,
      capacity,
    });
  }

  return results.sort((a, b) => a.payment - b.payment);
}

function missingProfileMessage(profile) {
  if (!profile.income) {
    return [
      "Necesito un dato para seguir.",
      "Tu ingreso mensual aproximado.",
      closingQuestion("¿Cuánto ganás al mes?"),
    ].join("\n");
  }

  if (profile.product !== "personal" && !profile.downPayment) {
    return [
      "Vamos bien.",
      "Ahora necesito tu prima aproximada.",
      closingQuestion("¿Con cuánto contás de prima?"),
    ].join("\n");
  }

  return "";
}

function likelyDocumentFollowUp(body) {
  const text = normalizeTypos(normalizeAmountWords(normalize(body)));
  const mentionsIncomeContext = /(ingreso|ingresos|salario|sueldo|neto|devengo|orden patronal|colilla|boleta|documento|pdf|archivo|adjunto|estos son mis ingresos|te mando|no debo|sin deudas?|deuda cero)/.test(text);
  const mentionsIntent = /(carro|auto|vehiculo|veiculo|casa|vivienda|hipoteca|credito|prestamo|financiar)/.test(text);
  return mentionsIncomeContext && mentionsIntent;
}

function productTitle(product) {
  if (product === "hipoteca") return "credito hipotecario";
  if (product === "vehiculo") return "credito vehicular";
  return "credito personal";
}

function assetLabel(product) {
  return product === "vehiculo" ? "vehiculo" : "bien";
}

function bold(value) {
  return `*${value}*`;
}

function closingQuestion(question) {
  return bold(question);
}

function hasDebtSignal(text) {
  return /(debo|debemos|deuda|deudas|pago|pagos|cuotas|rebajos|no debo|sin deudas?|deuda cero)/.test(text);
}

function hasDownPaymentSignal(text) {
  return /(prima|enganche|aporte)/.test(text);
}

function detectRequestedBank(text) {
  if (/\bbac\b|bac credomatic/.test(text)) return "BAC";
  if (/\bbn\b|banco nacional/.test(text)) return "Banco Nacional";
  if (/promerica/.test(text)) return "Promerica";
  if (/lafise/.test(text)) return "Lafise";
  if (/davi/.test(text)) return "DaviBank";
  return "";
}

function affordabilityGuidance(profile) {
  if (profile.product === "personal") return "";

  const conditions = BANKS.map((bank) => ({ bank: bank.name, condition: bank[profile.product] })).filter((item) => item.condition);
  if (!conditions.length) return "";

  const requestedAmount = profile.assetValue ? Math.max(0, profile.assetValue - profile.downPayment) : 0;
  let best = null;

  for (const item of conditions) {
    const years = Math.min(profile.requestedYears, item.condition.maxYears);
    const targetAmount = requestedAmount || item.condition.minAmount;
    const neededPayment = paymentFor(targetAmount, item.condition.rate, years);
    const neededIncome = Math.ceil((neededPayment + profile.debt) / item.condition.ratio);
    const extraIncome = Math.max(0, neededIncome - profile.income);
    const financeLimit = profile.assetValue ? profile.assetValue * (item.condition.finance || 0.85) : 0;
    const capacity = Math.max(0, profile.income * item.condition.ratio - profile.debt);
    const capacityAmount = amountForPayment(capacity, item.condition.rate, years);
    const extraDownPayment = profile.assetValue
      ? Math.max(0, requestedAmount - Math.min(capacityAmount, financeLimit))
      : 0;

    if (!best || extraIncome < best.extraIncome) {
      best = { bank: item.bank, extraIncome, extraDownPayment };
    }
  }

  if (!best) return "";
  if (best.extraIncome > 0 && best.extraDownPayment > 0) {
    return `Te ayudaría subir ingresos en ${bold(money(best.extraIncome))} o la prima en ${bold(money(best.extraDownPayment))}.`;
  }
  if (best.extraIncome > 0) {
    return `Te ayudaría subir ingresos en ${bold(money(best.extraIncome))}.`;
  }
  if (best.extraDownPayment > 0) {
    return `Te ayudaría subir la prima en ${bold(money(best.extraDownPayment))}.`;
  }
  return "";
}

function documentFollowUpMessage(profile) {
  const hints = [];
  if (profile.product === "vehiculo") hints.push("buscás carro");
  if (profile.product === "hipoteca") hints.push("buscás casa");
  if (profile.assetValue) hints.push("un valor meta de " + bold(money(profile.assetValue)));
  if (profile.downPayment) hints.push("una prima de " + bold(money(profile.downPayment)));
  if (profile.debt) hints.push("deudas por " + bold(money(profile.debt)));

  const secondLine = hints.length
    ? "Ya tengo presente que " + hints.join(", ") + "."
    : "Ya tengo claro si buscás casa o carro.";

  return [
    "Perfecto. Mandame la orden patronal o PDF.",
    secondLine,
    closingQuestion("¿Me lo enviás ahora?"),
  ].join("\n");
}

function formatResults(profile, results) {
  const hasAssetContext = profile.product !== "personal";
  const hasDownPaymentOnly = hasAssetContext && profile.downPayment > 0 && !profile.assetValue;
  const lines = [
    bold("Precalificacion estimada"),
    "Producto: " + bold(productTitle(profile.product)),
    "Ingreso: " + bold(money(profile.income)),
    "Deudas: " + bold(money(profile.debt)),
    profile.assetValue
      ? "Valor de referencia: " + bold(money(profile.assetValue)) + (profile.downPayment ? " | Prima: " + bold(money(profile.downPayment)) : "")
      : hasDownPaymentOnly
        ? "Sin valor del bien. Prima detectada: " + bold(money(profile.downPayment)) + "."
        : "Sin valor del bien: estimo el monto maximo segun capacidad de pago.",
    "",
  ];

  if (!results.length) {
    lines.push(profile.downPayment && hasAssetContext
      ? "Ya tomé en cuenta tu prima de " + bold(money(profile.downPayment)) + "."
      : "Con esos datos no encontre una opcion clara.");
    lines.push(affordabilityGuidance(profile) || "Probemos con más prima o menos monto.");
    lines.push("Esto es una precalificación estimada.");
    lines.push(closingQuestion("¿Querés que te diga cuánto prima te faltaría?"));
    return lines.join("\n");
  }

  if (results.length === 1) {
    lines.push("Hoy veo una opción clara con tu perfil.");
    lines.push("Las demás quedan cortas en política o capacidad.");
    lines.push("");
  }

  results.slice(0, 4).forEach((result, index) => {
    lines.push(
      `${index + 1}. ${bold(result.bank)}`,
      `Tasa: ${bold(result.rate.toFixed(2) + "%")} | Plazo: ${bold(result.years + " anos")}`,
      `${profile.assetValue ? "Monto financiado" : "Monto estimado"}: ${bold(money(result.amount))}`,
      hasDownPaymentOnly ? `Valor total aprox: ${bold(money(result.amount + profile.downPayment))}` : null,
      `Cuota aprox: ${bold(money(result.payment))}`,
      ""
    );
  });

  lines.push("Esto es una precalificación estimada.");
  if ((profile.product === "vehiculo" || profile.product === "hipoteca") && !profile.assetValue) {
    lines.push("Si me decís el valor del " + assetLabel(profile.product) + ", afino la cuota real.");
  }
  lines.push(closingQuestion("¿Cuál opción se ajusta mejor a tu cuota mensual?"));
  return lines.filter(Boolean).join("\n");
}

function buildReplyFromProfile(profile, options) {
  const cleanProfile = coerceProfile(profile);
  const missing = missingProfileMessage(cleanProfile);
  const prefixLines = Array.isArray(options && options.prefixLines) ? options.prefixLines.filter(Boolean) : [];

  if (missing) {
    return {
      message: prefixLines.length ? prefixLines.concat("", missing).join("\n") : missing,
    };
  }

  const message = formatResults(cleanProfile, simulate(cleanProfile));
  return {
    message: prefixLines.length ? prefixLines.concat("", message).join("\n") : message,
  };
}

function buildReply(input) {
  const body = input && input.body ? String(input.body) : "";
  const text = normalizeTypos(normalizeAmountWords(normalize(body)));
  const numMedia = Number(input && input.numMedia ? input.numMedia : 0);

  if (numMedia > 0) {
    return {
      message: [
        "Recibí tu documento.",
        "Voy a leer ingresos y rebajos.",
        closingQuestion("¿Buscás casa, carro o préstamo personal?"),
      ].join("\n"),
    };
  }

  const hasFinancialIntent = /(gano|ingreso|salario|sueldo|neto|debo|deuda|prima|enganche|casa|vivienda|hipoteca|carro|auto|vehiculo|credito|prestamo|plata|financiar)/.test(text);

  if (!text || (/^(hola|buenas|menu|ayuda|inicio|empezar|hey|ola)\b/.test(text) && !hasFinancialIntent)) {
    return {
      message: [
        "Hola. Soy " + bold("PreCali IA") + ".",
        "Te ayudo a precalificar y aplicar.",
        closingQuestion("¿Buscás casa, carro o préstamo personal?"),
      ].join("\n"),
    };
  }

  const profile = parseProfile(body);

  if (!profile.income && (
    likelyDocumentFollowUp(body) ||
    (profile.product !== "personal" && (profile.downPayment > 0 || profile.assetValue > 0 || /\b(no debo|sin deudas?|deuda cero)\b/.test(text)))
  )) {
    return { message: documentFollowUpMessage(profile) };
  }

  if (/(pdf|documento|orden|patronal|boleta|colilla|foto|imagen|adjunto|archivo)/.test(text) && !/(gano|ingreso|salario|sueldo|neto)/.test(text)) {
    return {
      message: [
        "Mandamelo por este chat.",
        "Leo PDF con texto y orden patronal.",
        closingQuestion("¿Querés simular casa o carro?"),
      ].join("\n"),
    };
  }

  if (/(aplicar|solicitar|me interesa|quiero esa|enviar|mandar|banco)/.test(text) && !/(gano|ingreso|salario|sueldo)/.test(text)) {
    const bank = detectRequestedBank(text);
    return {
      message: [
        bank ? `Perfecto. Seguimos con ${bold(bank)}.` : "Perfecto. Ya casi aplicamos.",
        "El siguiente paso pide tu consentimiento digital.",
        "Con eso validamos tu perfil real con el banco.",
        "Puede incluir revisión suave o formal.",
        closingQuestion(bank ? `¿Te envío el consentimiento para ${bank}?` : "¿Con cuál banco querés aplicar?"),
      ].join("\n"),
    };
  }

  if (/(estado|aprobado|rechazado|seguimiento)/.test(text)) {
    return {
      message: [
        "Estoy encima de tu trámite.",
        "Los estados pueden ser: En análisis, Aprobado o Faltan documentos.",
        "Te avisaré apenas cambie algo.",
        closingQuestion("¿Querés revisar si falta algún documento?"),
      ].join("\n"),
    };
  }

  if (profile.product === "personal" && !/(personal|consumo|libre inversion|gastos personales)/.test(text) && !profile.income) {
    return {
      message: [
        "Empecemos por el producto.",
        "Puedo ayudarte con casa, carro o personal.",
        closingQuestion("¿Qué querés simular hoy?"),
      ].join("\n"),
    };
  }

  if (profile.product !== "personal" && profile.income && !hasDebtSignal(text)) {
    return {
      message: [
        "Perfecto. Ya tengo tu ingreso.",
        "Ahora necesito tus deudas mensuales.",
        closingQuestion("¿Pagás alguna cuota hoy?"),
      ].join("\n"),
    };
  }

  if (profile.product !== "personal" && profile.income && hasDebtSignal(text) && !hasDownPaymentSignal(text) && !profile.downPayment) {
    return {
      message: [
        "Bien. Ya tengo ingreso y deudas.",
        "Ahora necesito tu prima aproximada.",
        closingQuestion("¿Con cuánto contás de prima?"),
      ].join("\n"),
    };
  }

  const missing = missingProfileMessage(profile);
  if (missing) return { message: missing };

  return { message: formatResults(profile, simulate(profile)) };
}

module.exports = {
  buildReply,
  buildReplyFromProfile,
  coerceProfile,
  parseProfile,
  simulate,
};
