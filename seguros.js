(function segurosRuntime() {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const YEAR = new Date().getFullYear();

  const TASAS_AUTO = {
    mx: { basico: [0.8, 1.5], intermedio: [2, 3.5], amplio: [3.5, 6.5] },
    gt: { basico: [1.2, 2], intermedio: [2, 3.5], amplio: [2.5, 5] },
    sv: { basico: [0.8, 1.5], intermedio: [1.5, 2.8], amplio: [2.2, 4] },
    hn: { basico: [1.5, 2.5], intermedio: [2.5, 4], amplio: [3.5, 6] },
    ni: { basico: [1.5, 2.5], intermedio: [2.5, 4], amplio: [3, 5.5] },
    cr: { basico: [0.8, 1.5], intermedio: [1.5, 2.5], amplio: [2, 4] },
    pa: { basico: [0.6, 1.1], intermedio: [1.2, 2], amplio: [2, 3.8] }
  };

  const SALUD_USD_MENSUAL_35 = {
    mx: [217, 371],
    gt: [103, 258],
    sv: [80, 220],
    hn: [99, 217],
    ni: [41, 110],
    cr: [59, 157],
    pa: [130, 250]
  };

  const DEFAULT_AUTO_VALOR = {
    cr: 12000000,
    mx: 350000,
    gt: 120000,
    sv: 20000,
    hn: 500000,
    ni: 15000,
    pa: 20000
  };

  const els = {
    pais: $('pais'),
    countryPill: $('insurance-country-pill'),
    results: $('insurance-results'),
    sort: $('insurance-sort'),
    modalHost: $('modal-host'),
    tabs: Array.from(document.querySelectorAll('.insurance-tab')),
    fields: Array.from(document.querySelectorAll('[data-insurance-fields]')),
    autoValor: $('ins-auto-valor'),
    autoValorLabel: $('ins-auto-valor-label'),
    autoAnio: $('ins-auto-anio'),
    autoAnioLabel: $('ins-auto-anio-label'),
    autoCobertura: $('ins-auto-cobertura'),
    autoUso: $('ins-auto-uso'),
    autoZona: $('ins-auto-zona'),
    autoEdad: $('ins-auto-edad'),
    autoEdadLabel: $('ins-auto-edad-label'),
    vidaEdad: $('ins-vida-edad'),
    vidaEdadLabel: $('ins-vida-edad-label'),
    vidaSuma: $('ins-vida-suma'),
    vidaSumaLabel: $('ins-vida-suma-label'),
    vidaFumador: $('ins-vida-fumador'),
    vidaPlazo: $('ins-vida-plazo'),
    saludEdad: $('ins-salud-edad'),
    saludEdadLabel: $('ins-salud-edad-label'),
    saludPlan: $('ins-salud-plan'),
    saludDeducible: $('ins-salud-deducible'),
    saludModalidad: $('ins-salud-modalidad'),
    saludRed: $('ins-salud-red')
  };

  let tipoActivo = 'auto';
  let usuarioEditoAutoValor = false;
  let ultimosSeguros = [];

  function paisId() {
    return els.pais?.value || document.documentElement.dataset.pais || 'cr';
  }

  function pais() {
    const ps = typeof PAISES !== 'undefined' ? PAISES : [];
    return ps.find(p => p.id === paisId()) || ps[0] || {
      id: 'cr',
      nombre: 'Costa Rica',
      moneda: 'CRC',
      simbolo: '₡',
      cambioUSD: 510
    };
  }

  function moneda() {
    const p = pais();
    return {
      codigo: p.moneda === 'USD/PAB' ? 'USD' : p.moneda,
      simbolo: p.simbolo || '$',
      cambioUSD: p.cambioUSD || 1
    };
  }


  function avisoLegalSeguro() {
    const avisos = typeof AVISOS_LEGALES !== 'undefined' ? AVISOS_LEGALES : {};
    return avisos[paisId()] || avisos.cr || {};
  }

  function renderAvisoLegalSeguro() {
    const target = $('insurance-legal-notice');
    const legal = avisoLegalSeguro();
    if (target && legal.seguros) {
      target.innerHTML = `<strong>Aviso legal de seguros (${pais().nombre}):</strong> ${legal.seguros} ${legal.privacidad || ''}`;
    }
  }

  function fmt(v, m = moneda()) {
    const value = Math.max(0, Math.round(Number(v) || 0));
    const formatted = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 0 }).format(value);
    return `${m.simbolo}${formatted}`;
  }

  function usdFmt(v) {
    return `$${new Intl.NumberFormat('es-CR', { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(Number(v) || 0)))}`;
  }

  function toLocal(usd) {
    const m = moneda();
    return m.codigo === 'USD' ? usd : usd * m.cambioUSD;
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, Number(n) || 0));
  }

  function textoSeguro(value) {
    return String(value || '')
      .replace(/á/g, 'á')
      .replace(/é/g, 'é')
      .replace(/í/g, 'í')
      .replace(/ó/g, 'ó')
      .replace(/ú/g, 'ú')
      .replace(/ñ/g, 'ñ')
      .replace(/Ã/g, 'Á')
      .replace(/É/g, 'É')
      .replace(/Ã/g, 'Í')
      .replace(/Ó/g, 'Ó')
      .replace(/Ú/g, 'Ú')
      .replace(/Ñ/g, 'Ñ')
      .replace(/₡/g, '₡')
      .replace(/·/g, '·');
  }

  function aseguradoras() {
    const data = typeof ASEGURADORAS !== 'undefined' ? ASEGURADORAS : [];
    return data.filter(a => a.pais === paisId() && a.productos?.[tipoActivo]);
  }

  function factorAntiguedad(anio) {
    const edadVehiculo = Math.max(0, YEAR - anio);
    if (edadVehiculo > 15) return 0.78;
    if (edadVehiculo > 10) return 0.85;
    if (edadVehiculo > 5) return 0.92;
    if (edadVehiculo <= 1) return 1.04;
    return 1;
  }

  function factorEdad(edad) {
    if (edad < 25) return 1.22;
    if (edad > 70) return 1.12;
    if (edad > 60) return 1.06;
    return 1;
  }

  function factorUso(uso) {
    if (uso === 'plataforma') return 1.6;
    if (uso === 'comercial') return 1.35;
    return 1;
  }

  function factorZona(zona) {
    if (zona === 'alto_riesgo') return 1.28;
    if (zona === 'capital') return 1.12;
    return 0.96;
  }

  function coberturaLabel(v) {
    return { basico: 'Básica / RC', intermedio: 'Intermedia', amplio: 'Todo riesgo' }[v] || v;
  }

  function precisionAuto() {
    const edad = Number(els.autoEdad.value || 35);
    if (els.autoUso.value !== 'particular' || els.autoZona.value === 'alto_riesgo' || edad < 25) return 'Media-alta';
    return 'Alta';
  }

  function build(a, min, max, meta) {
    const monthlyMin = meta.frecuencia === 'mensual' ? min : min / 12;
    const monthlyMax = meta.frecuencia === 'mensual' ? max : max / 12;
    return {
      aseguradora: a,
      min: Math.round(min),
      max: Math.round(max),
      monthlyMin: Math.round(monthlyMin),
      monthlyMax: Math.round(monthlyMax),
      cotizador: a.productos[tipoActivo].cotizador || a.web,
      nota: textoSeguro(a.productos[tipoActivo].nota || 'Precio final sujeto a evaluación oficial.'),
      meta
    };
  }

  function calcAuto(a) {
    const valor = clamp(els.autoValor.value, 1000, 999999999);
    const anio = clamp(els.autoAnio.value, 1990, YEAR + 1);
    const edad = clamp(els.autoEdad.value, 18, 85);
    const cobertura = els.autoCobertura.value;
    const tasas = (TASAS_AUTO[paisId()] || TASAS_AUTO.cr)[cobertura] || TASAS_AUTO.cr.amplio;
    const factor = factorAntiguedad(anio) * factorEdad(edad) * factorUso(els.autoUso.value) * factorZona(els.autoZona.value) * (a.productos.auto.factor || 1);
    const coberturaTexto = coberturaLabel(cobertura);

    return build(a, valor * (tasas[0] / 100) * factor, valor * (tasas[1] / 100) * factor, {
      frecuencia: 'anual',
      productoLabel: 'Seguro de vehículo',
      resumenCorto: coberturaTexto,
      detalle: `${coberturaTexto} · ${anio} · ${els.autoUso.options[els.autoUso.selectedIndex].text}`,
      variables: ['valor del vehículo', 'año', 'cobertura', 'zona', 'edad del conductor', 'uso'],
      precision: precisionAuto()
    });
  }

  function tarifaVida(edad) {
    if (edad <= 30) return [15, 25];
    if (edad <= 40) return [25, 45];
    if (edad <= 50) return [60, 110];
    return [140, 250];
  }

  function calcVida(a) {
    const edad = clamp(els.vidaEdad.value, 18, 75);
    const suma = clamp(els.vidaSuma.value, 5000, 2000000);
    const base = tarifaVida(edad);
    const fumadorFactor = els.vidaFumador.value === 'si' ? 1.45 : 1;
    const plazo = Number(els.vidaPlazo.value);
    const plazoFactor = plazo <= 10 ? 0.9 : plazo >= 30 ? 1.16 : 1;
    const factor = (suma / 50000) * fumadorFactor * plazoFactor * (a.productos.vida.factor || 1);

    return build(a, toLocal(base[0] * factor), toLocal(base[1] * factor), {
      frecuencia: 'mensual',
      productoLabel: 'Seguro de vida',
      resumenCorto: `${usdFmt(suma)} suma`,
      detalle: `${usdFmt(suma)} suma · ${plazo} años · ${els.vidaFumador.options[els.vidaFumador.selectedIndex].text}`,
      variables: ['edad', 'suma asegurada', 'fumador', 'plazo'],
      precision: edad > 55 ? 'Media' : 'Alta'
    });
  }

  function calcSalud(a) {
    const edad = clamp(els.saludEdad.value, 0, 80);
    const base = SALUD_USD_MENSUAL_35[paisId()] || SALUD_USD_MENSUAL_35.cr;
    const ageFactor = edad >= 35 ? 1 + ((edad - 35) * 0.06) : Math.max(0.55, 1 - ((35 - edad) * 0.025));
    const planFactor = { basico: 0.72, intermedio: 1, premium: 1.58 }[els.saludPlan.value] || 1;
    const deducibleFactor = { bajo: 1.18, medio: 1, alto: 0.82 }[els.saludDeducible.value] || 1;
    const modalidadFactor = els.saludModalidad.value === 'familiar' ? 2.18 : 1;
    const redFactor = { local: 1, regional: 1.18, internacional: 1.45 }[els.saludRed.value] || 1;
    const factor = ageFactor * planFactor * deducibleFactor * modalidadFactor * redFactor * (a.productos.salud.factor || 1);

    return build(a, toLocal(base[0] * factor), toLocal(base[1] * factor), {
      frecuencia: 'mensual',
      productoLabel: 'Seguro de salud',
      resumenCorto: els.saludPlan.options[els.saludPlan.selectedIndex].text,
      detalle: `${els.saludPlan.options[els.saludPlan.selectedIndex].text} · ${els.saludModalidad.options[els.saludModalidad.selectedIndex].text} · red ${els.saludRed.options[els.saludRed.selectedIndex].text.toLowerCase()}`,
      variables: ['edad', 'nivel de plan', 'deducible', 'modalidad', 'red médica'],
      precision: els.saludRed.value === 'internacional' ? 'Media' : 'Media-alta'
    });
  }

  function calcular() {
    return aseguradoras().map(a => {
      if (tipoActivo === 'vida') return calcVida(a);
      if (tipoActivo === 'salud') return calcSalud(a);
      return calcAuto(a);
    });
  }

  function rangeLabel(r, m = moneda()) {
    const sufijo = r.meta.frecuencia === 'mensual' ? '/ mes' : '/ año';
    return `${fmt(r.min, m)} - ${fmt(r.max, m)} ${sufijo}`;
  }

  function renderLabels() {
    const m = moneda();
    renderAvisoLegalSeguro();
    if (els.countryPill) els.countryPill.textContent = `${pais().nombre} · ${m.codigo}`;
    if (els.autoValorLabel) els.autoValorLabel.textContent = fmt(els.autoValor.value, m);
    if (els.autoAnioLabel) els.autoAnioLabel.textContent = `${els.autoAnio.value || YEAR}`;
    if (els.autoEdadLabel) els.autoEdadLabel.textContent = `${els.autoEdad.value || 35} años`;
    if (els.vidaEdadLabel) els.vidaEdadLabel.textContent = `${els.vidaEdad.value || 35} años`;
    if (els.vidaSumaLabel) els.vidaSumaLabel.textContent = usdFmt(els.vidaSuma.value);
    if (els.saludEdadLabel) els.saludEdadLabel.textContent = `${els.saludEdad.value || 35} años`;
  }

  function render() {
    renderLabels();
    let results = calcular();
    const sort = els.sort?.value || 'precio';
    results.sort(sort === 'rating'
      ? (a, b) => (b.aseguradora.rating || 0) - (a.aseguradora.rating || 0)
      : (a, b) => a.monthlyMin - b.monthlyMin
    );

    ultimosSeguros = results;

    if (!results.length) {
      els.results.innerHTML = `
        <div class="market-pending-card">
          <div class="market-pending-flag">${pais().bandera || ''}</div>
          <div>
            <strong>No hay aseguradoras cargadas para este producto</strong>
            <p>Estamos validando fuentes y cotizadores oficiales para ${pais().nombre}. Probá con otro tipo de seguro o país.</p>
          </div>
        </div>
      `;
      return;
    }

    const bestPrice = Math.min(...results.map(r => r.monthlyMin));
    const bestRating = Math.max(...results.map(r => r.aseguradora.rating || 0));
    const m = moneda();

    els.results.innerHTML = results.map((r, idx) => {
      const isBestPrice = r.monthlyMin === bestPrice;
      const isBestRating = (r.aseguradora.rating || 0) === bestRating;
      const nombre = textoSeguro(r.aseguradora.nombre);
      const tipo = textoSeguro(r.aseguradora.tipo);
      return `
        <div class="bank-card ${isBestPrice ? 'best' : ''}" style="animation-delay: ${idx * 60}ms;">
          ${isBestPrice ? '<span class="best-badge">Mejor opción</span>' : ''}
          <div class="bank-card-header">
            <div class="bank-card-info">
              <div class="bank-logo" style="background:${r.aseguradora.color};">${r.aseguradora.iniciales}</div>
              <div class="bank-card-info-text">
                <div class="bank-card-name">${nombre}</div>
                <div class="bank-card-meta">${tipo} · ${r.meta.productoLabel} · ${r.meta.precision} precisión${isBestRating ? ' · mejor rating' : ''}</div>
              </div>
            </div>
            <div class="bank-card-actions">
              <span class="status-ok">✓ Estimado</span>
              <button class="btn-detail" type="button" onclick="verDetalleSeguro(${idx})">Ver detalles</button>
              <button class="btn-email" type="button" onclick="abrirEmailSeguro(${idx})">Envíenmelo por email</button>
            </div>
          </div>
          <div class="bank-metrics">
            <div class="metric">
              <span class="metric-label">Prima estimada</span>
              <span class="metric-value">${rangeLabel(r, m)}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Desde</span>
              <span class="metric-value">${fmt(r.monthlyMin, m)} / mes</span>
            </div>
            <div class="metric">
              <span class="metric-label">Frecuencia</span>
              <span class="metric-value">${r.meta.frecuencia === 'mensual' ? 'Mensual' : 'Anual'}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Perfil</span>
              <span class="metric-value">${r.meta.resumenCorto}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  window.verDetalleSeguro = function verDetalleSeguro(idx) {
    const r = ultimosSeguros[idx];
    if (!r || !els.modalHost) return;
    const m = moneda();
    const nombre = textoSeguro(r.aseguradora.nombre);
    const rating = r.aseguradora.rating ? `${r.aseguradora.rating}/10` : 'No disponible';

    els.modalHost.innerHTML = `
      <div class="modal-overlay" onclick="cerrarModal(event)">
        <div class="modal" onclick="event.stopPropagation()">
          <div class="modal-header">
            <div class="modal-header-info">
              <div class="bank-logo" style="background:${r.aseguradora.color};">${r.aseguradora.iniciales}</div>
              <div>
                <div class="modal-header-name">${nombre}</div>
                <div class="modal-header-tag">${r.meta.productoLabel} · ${pais().nombre} · ${m.codigo}</div>
              </div>
            </div>
            <button class="modal-close" onclick="cerrarModal(event)" aria-label="Cerrar">×</button>
          </div>

          <div class="modal-section-title">Tu estimación</div>
          <div class="modal-table">
            <div class="modal-row"><span class="label">Prima estimada</span><span class="val">${rangeLabel(r, m)}</span></div>
            <div class="modal-row"><span class="label">Desde</span><span class="val">${fmt(r.monthlyMin, m)} / mes</span></div>
            <div class="modal-row"><span class="label">Producto</span><span class="val">${r.meta.productoLabel}</span></div>
            <div class="modal-row"><span class="label">Perfil evaluado</span><span class="val">${r.meta.detalle}</span></div>
            <div class="modal-row"><span class="label">Precisión estimada</span><span class="val">${r.meta.precision}</span></div>
            <div class="modal-row"><span class="label">Rating / fortaleza</span><span class="val">${rating}</span></div>
          </div>

          <div class="modal-section-title">Condiciones de la aseguradora</div>
          <div class="modal-table">
            <div class="modal-row"><span class="label">Moneda</span><span class="val">${m.codigo}</span></div>
            <div class="modal-row"><span class="label">Frecuencia</span><span class="val">${r.meta.frecuencia === 'mensual' ? 'Mensual' : 'Anual'}</span></div>
            <div class="modal-row"><span class="label">Cotizador oficial</span><span class="val">Disponible</span></div>
            <div class="modal-row"><span class="label">Fuente</span><span class="val">Información pública</span></div>
          </div>

          <div class="modal-section-title">Variables usadas</div>
          <div class="modal-requisitos-intro">
            <strong>PreCali estima con las variables principales que piden los cotizadores.</strong>
            El precio final puede cambiar por historial, zona exacta, deducible, exclusiones, inspección y evaluación oficial.
          </div>
          <div class="modal-requisitos">
            <div class="requisitos-grupo">
              <div class="requisitos-categoria">Perfil del seguro</div>
              <ul class="requisitos-lista">
                ${r.meta.variables.map(v => `<li>${v}</li>`).join('')}
              </ul>
            </div>
          </div>

          <div class="modal-section-title">Cómo leer este rango</div>
          <div class="modal-glosario">
            <p><strong>PreCali estima un rango.</strong> En seguros no existe una cuota exacta pública como en créditos: cada aseguradora usa tablas actuariales privadas.</p>
            <p><strong>Precio final:</strong> depende de historial, zona, deducible, coberturas adicionales y evaluación oficial.</p>
            <p><em>${r.nota}</em></p>
          </div>

          <div class="modal-section-title">Aviso legal en ${pais().nombre}</div>
          <div class="modal-glosario">
            <p>${avisoLegalSeguro().seguros || 'Estimación orientativa. El precio final lo confirma la aseguradora.'}</p>
          </div>

          <div class="modal-actions">
            <a href="${r.cotizador}" target="_blank" rel="noopener" class="modal-link-official">Ir al cotizador oficial</a>
            <button class="modal-btn-email" onclick="abrirEmailSeguro(${idx})">Enviármelo por email</button>
            <button class="modal-btn-cancel" onclick="cerrarModal(event)">Cerrar</button>
          </div>
          <div class="modal-source">Las primas son orientativas. PreCali no intermedia contratos de seguros.</div>
        </div>
      </div>
    `;
  };

  window.abrirEmailSeguro = function abrirEmailSeguro(idx) {
    const r = ultimosSeguros[idx];
    if (!r || !els.modalHost) return;
    const nombre = textoSeguro(r.aseguradora.nombre);
    const m = moneda();

    els.modalHost.innerHTML = `
      <div class="modal-overlay" onclick="cerrarModal(event)">
        <div class="modal modal-email" onclick="event.stopPropagation()">
          <div class="modal-header">
            <div>
              <div class="modal-header-name">Enviar estimación por email</div>
              <div class="modal-header-tag">${nombre} · ${rangeLabel(r, m)}</div>
            </div>
            <button class="modal-close" onclick="cerrarModal(event)" aria-label="Cerrar">×</button>
          </div>

          <form id="seg-lead-form" onsubmit="event.preventDefault(); enviarEmailSeguro(${idx});">
            <div class="form-row">
              <div class="form-group">
                <label>Nombre</label>
                <input id="seg-lead-nombre" class="input-text" type="text" placeholder="Tu nombre" required>
              </div>
              <div class="form-group">
                <label>Apellido</label>
                <input id="seg-lead-apellido" class="input-text" type="text" placeholder="Tu apellido" required>
              </div>
            </div>
            <div class="form-group">
              <label>Email</label>
              <input id="seg-lead-email" class="input-text" type="email" placeholder="tu@email.com" required>
            </div>
            <label class="checkbox-row">
              <input id="seg-lead-privacy" type="checkbox" onchange="actualizarBotonEnvioSeguro()">
              <span>Acepto recibir esta estimación por correo y entiendo que es orientativa.</span>
            </label>
            <button id="seg-lead-submit" class="modal-btn-email" type="submit" disabled>Enviar estimación</button>
            <button class="modal-btn-cancel" type="button" onclick="cerrarModal(event)">Cancelar</button>
          </form>
        </div>
      </div>
    `;
  };

  window.actualizarBotonEnvioSeguro = function actualizarBotonEnvioSeguro() {
    const submit = $('seg-lead-submit');
    const privacy = $('seg-lead-privacy');
    if (submit && privacy) submit.disabled = !privacy.checked;
  };

  window.enviarEmailSeguro = async function enviarEmailSeguro(idx) {
    const r = ultimosSeguros[idx];
    if (!r) return;
    const submit = $('seg-lead-submit');
    const form = $('seg-lead-form');
    if (!form?.checkValidity()) {
      form?.reportValidity();
      return;
    }

    const data = new FormData();
    const m = moneda();
    data.append('form-name', 'lead-precalificacion');
    data.append('nombre', $('seg-lead-nombre').value);
    data.append('apellido', $('seg-lead-apellido').value);
    data.append('email', $('seg-lead-email').value);
    data.append('pais', pais().nombre);
    data.append('tipo-prestamo', `Seguro - ${r.meta.productoLabel}`);
    data.append('banco', textoSeguro(r.aseguradora.nombre));
    data.append('monto', rangeLabel(r, m));
    data.append('cuota', `${fmt(r.monthlyMin, m)} / mes`);
    data.append('plazo', r.meta.frecuencia);
    data.append('fuente', 'PreCali Seguros');

    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Enviando...';
    }

    try {
      await fetch('/', { method: 'POST', body: data });
      mostrarConfirmacionSeguro($('seg-lead-nombre').value, $('seg-lead-email').value, r);
    } catch (error) {
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Enviar estimación';
      }
      alert('No pudimos registrar el envío. Intentá de nuevo.');
    }
  };

  function mostrarConfirmacionSeguro(nombre, email, r) {
    if (!els.modalHost) return;
    els.modalHost.innerHTML = `
      <div class="modal-overlay" onclick="cerrarModal(event)">
        <div class="modal modal-email" onclick="event.stopPropagation()">
          <div class="modal-header">
            <div>
              <div class="modal-header-name">Estimación enviada</div>
              <div class="modal-header-tag">${textoSeguro(r.aseguradora.nombre)}</div>
            </div>
            <button class="modal-close" onclick="cerrarModal(event)" aria-label="Cerrar">×</button>
          </div>
          <div class="modal-glosario">
            <p><strong>Listo, ${nombre}.</strong> Registramos la solicitud para enviar la estimación a <strong>${email}</strong>.</p>
            <p>Recordá que el precio final lo confirma la aseguradora con su cotizador oficial.</p>
          </div>
          <button class="modal-btn-email" onclick="cerrarModal(event)">Cerrar</button>
        </div>
      </div>
    `;
  }

  function setTipo(next) {
    tipoActivo = next;
    els.tabs.forEach(t => t.classList.toggle('active', t.dataset.insuranceType === next));
    els.fields.forEach(g => { g.hidden = g.dataset.insuranceFields !== next; });
    render();
  }

  function syncCountry(force = false) {
    if (els.autoValor && (force || !usuarioEditoAutoValor)) {
      els.autoValor.value = DEFAULT_AUTO_VALOR[paisId()] || DEFAULT_AUTO_VALOR.cr;
    }
    render();
  }

  function init() {
    if (!els.results) return;
    els.tabs.forEach(t => t.addEventListener('click', () => setTipo(t.dataset.insuranceType)));
    document.querySelectorAll('#insurance-form input, #insurance-form select').forEach(input => input.addEventListener('input', render));
    document.querySelectorAll('#insurance-form select').forEach(input => input.addEventListener('change', render));
    els.sort?.addEventListener('change', render);
    els.autoValor?.addEventListener('input', () => { usuarioEditoAutoValor = true; });
    els.pais?.addEventListener('change', () => syncCountry(true));
    els.pais?.addEventListener('input', () => syncCountry(true));
    syncCountry(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
