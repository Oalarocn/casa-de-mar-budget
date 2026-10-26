/* Lectura de Excel para actualizar la disponibilidad, y descarga de la plantilla.
   Formatos que entiende:
   1. Tracker de Casa de Mar: hojas con encabezados APT 1…APT 4 y filas «Piso N» / «PH».
      El color de la celda decide: sin color, blanco o azul claro = disponible; gris, amarillo u otro = reservado.
   2. Plantilla: una fila por unidad con columnas Código, Disponible, Destacar (y opcionalmente datos).
   3. Lista simple de códigos (T2-801…): las listadas quedan disponibles y el resto de su torre, reservadas. */
(function () {
  'use strict';
  const CDM = (window.CDM = window.CDM || {});
  const F = CDM.formato;
  const norm = F.normalizar;

  // ------------------------------------------------------------------ carga diferida de ExcelJS
  let cargando = null;
  function cargarExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (!cargando) {
      cargando = new Promise((ok, mal) => {
        const s = document.createElement('script');
        s.src = 'vendor/exceljs.min.js';
        s.onload = () => (window.ExcelJS ? ok(window.ExcelJS) : mal(new Error('No se pudo iniciar el lector de Excel.')));
        s.onerror = () => {
          cargando = null;
          mal(new Error('No se pudo cargar el lector de Excel. Revisa tu conexión.'));
        };
        document.head.appendChild(s);
      });
    }
    return cargando;
  }

  // ------------------------------------------------------------------ colores
  const TEMA_OFFICE = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'];
  const INDEXADOS = ('000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF ' +
    '800000 008000 000080 808000 800080 008080 C0C0C0 808080 9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF ' +
    '000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF 00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 ' +
    '3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333').split(' ');

  function hexARgb(h) {
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  }
  function rgbAHls(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, l, 0];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, l, s];
  }
  function hlsARgb(h, l, s) {
    if (s === 0) return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      t = (t + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(h / 360 + 1 / 3), f(h / 360), f(h / 360 - 1 / 3)];
  }
  function conTinte(hex, tinte) {
    if (!tinte) return hex;
    const [h, l0, s] = rgbAHls(...hexARgb(hex));
    const l = tinte < 0 ? l0 * (1 + tinte) : l0 * (1 - tinte) + tinte;
    return hlsARgb(h, l, s)
      .map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }
  function temaDelLibro(wb) {
    const tema = TEMA_OFFICE.slice();
    try {
      const xml = wb._themes && (wb._themes.theme1 || Object.values(wb._themes)[0]);
      if (typeof xml !== 'string') return tema;
      const orden = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
      orden.forEach((tag, i) => {
        const m = xml.match(new RegExp('<a:' + tag + '>[\\s\\S]*?(?:srgbClr val="([0-9A-Fa-f]{6})"|lastClr="([0-9A-Fa-f]{6})")'));
        if (m) tema[i] = (m[1] || m[2]).toUpperCase();
      });
    } catch (e) {
      /* se usa el tema de Office por defecto */
    }
    return tema;
  }
  function colorDeRelleno(fill, tema) {
    if (!fill) return null;
    if (fill.type === 'gradient') return '808080';
    if (fill.type !== 'pattern' || !fill.pattern || fill.pattern === 'none') return null;
    const c = fill.fgColor || {};
    if (c.argb) return String(c.argb).slice(-6).toUpperCase();
    if (c.theme !== undefined) return conTinte(tema[c.theme] || 'FFFFFF', c.tint || 0);
    if (c.indexed !== undefined) return c.indexed >= 64 ? null : INDEXADOS[c.indexed] || null;
    return null;
  }
  /** Sin color, blanco o azul claro = disponible. Cualquier otro color = reservado. */
  function disponiblePorColor(hex) {
    if (!hex) return true;
    const [r, g, b] = hexARgb(hex);
    if (Math.min(r, g, b) >= 245 / 255) return true;
    const [h, l, s] = rgbAHls(r, g, b);
    return h >= 190 && h <= 230 && l >= 0.75 && s >= 0.2;
  }

  // ------------------------------------------------------------------ lectura de valores
  const RE_CODIGO = /\bT\s*([12])\s*[-–_ ]?\s*(PH\s*0?(\d)|(\d)(\d{2}))\b/i;

  function numero(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let t = String(v === null || v === undefined ? '' : v).replace(/[^\d.,-]/g, '');
    if (!t || !/\d/.test(t)) return null;
    if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else if (t.includes(',')) t = t.split(',').pop().length === 3 ? t.replace(/,/g, '') : t.replace(',', '.');
    else if ((t.match(/\./g) || []).length > 1 || (t.includes('.') && t.split('.').pop().length === 3 && t.length > 4)) t = t.replace(/\./g, '');
    const x = parseFloat(t);
    return isFinite(x) ? x : null;
  }
  function siNo(v) {
    const t = norm(v);
    if (!t) return null;
    if (/^(si|s|x|1|true|verdadero|yes|y|ok|v|✓|✔|★)$/.test(t)) return true;
    if (/^(no|n|0|false|falso|-)$/.test(t)) return false;
    return null;
  }
  function estadoDeTexto(v) {
    const t = norm(v);
    if (!t) return false;
    const sn = siNo(t);
    if (sn !== null) return sn;
    if (/(no disp|reserv|vendid|bloque|proceso|apartad|ocupad|separad|cerrad)/.test(t)) return false;
    if (/(disp|libre|venta)/.test(t)) return true;
    return false;
  }
  function textoDeCelda(cell) {
    try {
      const t = cell.text;
      if (t !== undefined && t !== null) return String(t).trim();
    } catch (e) {
      /* algunos tipos de celda no tienen .text */
    }
    const v = cell.value;
    if (v && typeof v === 'object') {
      if (v.richText) return v.richText.map((r) => r.text).join('').trim();
      if ('result' in v) return String(v.result === undefined || v.result === null ? '' : v.result).trim();
      if (v.text) return String(v.text).trim();
    }
    return String(v === null || v === undefined ? '' : v).trim();
  }

  /** Datos de una celda del tracker: «Glass\n254.44 m²\n3 Hab / 3 Baños\n$1.272.200». */
  function datosDeCeldaTracker(texto) {
    const lineas = String(texto).replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
    const primera = lineas[0] || '';
    const area = texto.match(/([\d.,]+)\s*m(²|2)/i);
    const hab = texto.match(/(\d+)\s*hab/i);
    const precio = texto.match(/\$\s*([\d.,]+)/);
    return {
      modelo: primera.replace(/\s*-\s*c\s*\/\s*jacuzzi.*$/i, '').replace(/\s+/g, ' ').trim(),
      jacuzzi: /jacuzzi/i.test(texto),
      area: area ? numero(area[1]) : undefined,
      hab: hab ? parseInt(hab[1], 10) : undefined,
      precio: precio && /\d/.test(precio[1]) ? numero(precio[1]) : /\$\s*-/.test(texto) ? null : undefined,
    };
  }

  // ------------------------------------------------------------------ búsqueda de unidades
  function indice(inv) {
    const porId = new Map();
    const porPos = new Map();
    for (const torre of Object.values(inv.torres)) {
      for (const u of torre.unidades) {
        porId.set(u.id, u);
        porPos.set(torre.id + '|' + u.nivel + '|' + u.pos, u);
      }
    }
    const cuantos = (t, nivel) => inv.torres[t].unidades.filter((u) => u.nivel === nivel).length;
    return {
      porId,
      buscar(t, nivel, pos) {
        let u = porPos.get(t + '|' + nivel + '|' + pos);
        // En filas de dos unidades (PH y jardines) el tracker usa las columnas APT 1 y APT 3.
        if (!u && pos === 3 && inv.torres[t] && cuantos(t, nivel) === 2) u = porPos.get(t + '|' + nivel + '|2');
        return u || null;
      },
    };
  }
  function codigoDeTexto(texto, idx, exacto) {
    const limpio = String(texto || '').trim();
    if (exacto && !new RegExp('^' + RE_CODIGO.source + '$', 'i').test(limpio)) return null;
    const m = limpio.match(RE_CODIGO);
    if (!m) return null;
    const torre = 'T' + m[1];
    if (m[3]) return idx.buscar(torre, 'PH', parseInt(m[3], 10));
    return idx.buscar(torre, String(parseInt(m[4], 10)), parseInt(m[5], 10));
  }
  function torreDeTexto(v) {
    const m = norm(v).match(/^(?:torre\s*|t\s*)?([12])$/);
    return m ? 'T' + m[1] : null;
  }
  function nivelDeTexto(v) {
    const t = norm(v);
    if (/^(ph|penthouse|pent house)\b/.test(t)) return 'PH';
    const m = t.match(/(\d+)/);
    return m ? String(parseInt(m[1], 10)) : null;
  }

  // ------------------------------------------------------------------ modelo de hoja
  function modeloHoja(ws, tema) {
    const filas = [];
    const maxF = Math.min(ws.actualRowCount ? Math.max(ws.rowCount, ws.actualRowCount) : ws.rowCount || 0, 600);
    const maxC = Math.min(ws.columnCount || 0, 40);
    for (let r = 1; r <= maxF; r++) {
      const row = ws.getRow(r);
      const fila = [];
      for (let c = 1; c <= maxC; c++) {
        const cell = row.getCell(c);
        const esclava = !!(cell.isMerged && cell.master && cell.master.address !== cell.address);
        fila.push({
          texto: esclava ? '' : textoDeCelda(cell),
          valor: esclava ? null : cell.value,
          color: esclava ? null : colorDeRelleno(cell.fill, tema),
          esclava,
        });
      }
      filas.push(fila);
    }
    return { nombre: ws.name, filas };
  }

  // ------------------------------------------------------------------ formato 1: tracker
  function leerTracker(hoja, inv, idx) {
    let fe = -1;
    let colsApt = [];
    let colNivel = 0;
    for (let r = 0; r < Math.min(hoja.filas.length, 25) && fe < 0; r++) {
      const apts = [];
      hoja.filas[r].forEach((c, i) => {
        const m = norm(c.texto).match(/^apt\.?\s*(\d)$/);
        if (m) apts.push({ i, n: +m[1] });
      });
      if (apts.length >= 2) {
        fe = r;
        colsApt = apts.sort((a, b) => a.n - b.n).map((a) => a.i);
        const iN = hoja.filas[r].findIndex((c) => /^(nivel|piso)/.test(norm(c.texto)));
        colNivel = iN >= 0 ? iN : 0;
      }
    }
    if (fe < 0) return null;
    let torre = null;
    const enNombre = norm(hoja.nombre).match(/torre\s*(\d)/);
    if (enNombre) torre = 'T' + enNombre[1];
    for (let r = 0; r < fe && !torre; r++) {
      for (const c of hoja.filas[r]) {
        const m = norm(c.texto).match(/torre\s*(\d)/);
        if (m) {
          torre = 'T' + m[1];
          break;
        }
      }
    }
    if (!torre || !inv.torres[torre]) return null;

    const celdas = [];
    for (let r = fe + 1; r < hoja.filas.length; r++) {
      const fila = hoja.filas[r];
      const et = norm(fila[colNivel] && fila[colNivel].texto);
      let nivel = null;
      const mp = et.match(/^(piso|nivel|nv\.?)\s*(\d+)/);
      if (mp) nivel = String(parseInt(mp[2], 10));
      else if (/^(ph|penthouse)\b/.test(et)) nivel = 'PH';
      if (!nivel) continue;
      const propias = colsApt.map((i) => fila[i]).filter((c) => c && !c.esclava);
      propias.forEach((c, i) => {
        if (c.texto) celdas.push({ nivel, pos: i + 1, texto: c.texto, color: c.color, fila: r + 1 });
      });
    }
    if (!celdas.length) return null;
    let coincidencias = 0;
    for (const c of celdas) {
      const u = idx.buscar(torre, c.nivel, c.pos);
      if (u && norm(datosDeCeldaTracker(c.texto).modelo) === norm(u.modelo)) coincidencias++;
    }
    return { torre, hoja: hoja.nombre, celdas, coincidencias };
  }

  // ------------------------------------------------------------------ formato 2 y 3: tabla o lista
  const COLUMNAS = {
    codigo: ['codigo', 'cod', 'id', 'clave', 'codigo unidad', 'codigo de unidad'],
    torre: ['torre', 'tower', 'edificio'],
    nivel: ['nivel', 'piso', 'planta', 'level', 'floor', 'nv'],
    pos: ['posicion', 'pos', 'apt', 'apto', 'numero de apto', 'posicion apt'],
    modelo: ['modelo', 'tipo', 'unidad', 'model', 'apartamento'],
    area: ['area', 'area m2', 'm2', 'mts', 'mts2', 'metros', 'metros cuadrados', 'superficie'],
    hab: ['habitaciones', 'hab', 'recamaras', 'dormitorios', 'cuartos'],
    jacuzzi: ['jacuzzi', 'jacuzzy'],
    precio: ['precio', 'precio usd', 'valor', 'price', 'precio de lista'],
    disponible: ['disponible', 'disponibilidad', 'estado', 'status', 'estatus', 'situacion'],
    destacar: ['destacar', 'destacado', 'destacada', 'estrella', 'recomendado', 'star'],
  };
  function campoDeEncabezado(texto) {
    const t = norm(texto).replace(/²/g, '2').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    for (const [campo, alias] of Object.entries(COLUMNAS)) {
      if (alias.some((a) => t === a || t.startsWith(a + ' '))) return campo;
    }
    return null;
  }

  function leerTabla(hoja, inv, idx) {
    let fe = -1;
    let mapa = null;
    let mejor = 0;
    for (let r = 0; r < Math.min(hoja.filas.length, 15); r++) {
      const m = {};
      hoja.filas[r].forEach((c, i) => {
        const campo = campoDeEncabezado(c.texto);
        if (campo && m[campo] === undefined) m[campo] = i;
      });
      const n = Object.keys(m).length;
      const util = m.codigo !== undefined || (m.torre !== undefined && m.nivel !== undefined) || m.disponible !== undefined;
      if (n >= 2 && util && n > mejor) {
        mejor = n;
        fe = r;
        mapa = m;
      }
    }
    const resultado = { hoja: hoja.nombre, filas: [], conEstado: false, conEstrella: false, conEncabezado: fe >= 0, avisos: [] };
    if (fe < 0) {
      // Sin encabezados: buscar códigos en cualquier celda.
      hoja.filas.forEach((fila, r) => {
        for (const c of fila) {
          const u = codigoDeTexto(c.texto, idx, true);
          if (u) resultado.filas.push({ unidad: u, fila: r + 1 });
        }
      });
      return resultado.filas.length ? resultado : null;
    }
    resultado.conEstado = mapa.disponible !== undefined;
    resultado.conEstrella = mapa.destacar !== undefined;
    const celda = (fila, campo) => (mapa[campo] === undefined ? null : fila[mapa[campo]] || null);
    for (let r = fe + 1; r < hoja.filas.length; r++) {
      const fila = hoja.filas[r];
      if (!fila.some((c) => c.texto)) continue;
      let u = null;
      const cCod = celda(fila, 'codigo');
      if (cCod && cCod.texto) u = codigoDeTexto(cCod.texto, idx);
      const torre = celda(fila, 'torre') ? torreDeTexto(celda(fila, 'torre').texto) : null;
      const nivel = celda(fila, 'nivel') ? nivelDeTexto(celda(fila, 'nivel').texto) : null;
      if (!u && torre && nivel && celda(fila, 'pos')) {
        const pos = parseInt(numero(celda(fila, 'pos').texto), 10);
        if (pos) u = idx.buscar(torre, nivel, pos);
      }
      if (!u && torre && nivel && celda(fila, 'modelo')) {
        const modelo = norm(celda(fila, 'modelo').texto);
        let cands = inv.torres[torre].unidades.filter((x) => x.nivel === nivel && (norm(x.modelo) === modelo || norm(x.nombre) === modelo));
        const area = celda(fila, 'area') ? numero(celda(fila, 'area').texto) : null;
        if (cands.length > 1 && area) {
          cands.sort((a, b) => Math.abs(a.area - area) - Math.abs(b.area - area));
          if (Math.abs(cands[0].area - area) < 0.6) cands = [cands[0]];
        }
        if (cands.length === 1) u = cands[0];
      }
      if (!u) {
        for (const c of fila) {
          u = codigoDeTexto(c.texto, idx, true);
          if (u) break;
        }
      }
      if (!u) {
        const muestra = fila.map((c) => c.texto).filter(Boolean).slice(0, 4).join(' · ');
        resultado.avisos.push(`Fila ${r + 1} (${hoja.nombre}): no se reconoce la unidad «${muestra}».`);
        continue;
      }
      const reg = { unidad: u, fila: r + 1, datos: {} };
      if (resultado.conEstado) reg.d = estadoDeTexto(celda(fila, 'disponible').texto);
      if (resultado.conEstrella) reg.e = siNo(celda(fila, 'destacar').texto) === true;
      const cPrecio = celda(fila, 'precio');
      if (cPrecio && cPrecio.texto) {
        const p = typeof cPrecio.valor === 'number' ? cPrecio.valor : numero(cPrecio.texto);
        if (p !== null) reg.datos.precio = Math.round(p);
        else if (/consult|-/.test(norm(cPrecio.texto))) reg.datos.precio = null;
      }
      const cArea = celda(fila, 'area');
      if (cArea && cArea.texto) {
        const a = typeof cArea.valor === 'number' ? cArea.valor : numero(cArea.texto);
        if (a !== null) reg.datos.area = Math.round(a * 100) / 100;
      }
      const cHab = celda(fila, 'hab');
      if (cHab && cHab.texto) {
        const h = numero(cHab.texto);
        if (h !== null) reg.datos.hab = Math.round(h);
      }
      const cJac = celda(fila, 'jacuzzi');
      if (cJac && cJac.texto && siNo(cJac.texto) !== null) reg.datos.jacuzzi = siNo(cJac.texto);
      resultado.filas.push(reg);
    }
    return resultado.filas.length ? resultado : null;
  }

  function tablaCSV(texto) {
    const lineas = texto.replace(/^\uFEFF/, '').split(/\r?\n/);
    const muestra = lineas.slice(0, 5).join('\n');
    const sep = (muestra.match(/;/g) || []).length > (muestra.match(/,/g) || []).length ? ';' : ',';
    const filas = [];
    let fila = [];
    let campo = '';
    let comillas = false;
    const src = lineas.join('\n');
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (comillas) {
        if (ch === '"' && src[i + 1] === '"') {
          campo += '"';
          i++;
        } else if (ch === '"') comillas = false;
        else campo += ch;
      } else if (ch === '"') comillas = true;
      else if (ch === sep) {
        fila.push(campo);
        campo = '';
      } else if (ch === '\n') {
        fila.push(campo);
        filas.push(fila);
        fila = [];
        campo = '';
      } else campo += ch;
    }
    fila.push(campo);
    filas.push(fila);
    return { nombre: 'CSV', filas: filas.map((f) => f.map((t) => ({ texto: t.trim(), valor: t.trim(), color: null, esclava: false }))) };
  }

  function errorUsuario(msg) {
    const e = new Error(msg);
    e.usuario = true;
    return e;
  }

  // ------------------------------------------------------------------ importar
  /**
   * Lee un archivo y devuelve los cambios propuestos (no toca el estado).
   * @returns {Promise<{formato:string, detalle:string, torres:string[], cambios:Object, implicito:boolean, avisos:string[]}>}
   */
  async function leerArchivo(archivo, inv) {
    const nombre = archivo.name || 'archivo';
    const ext = (nombre.split('.').pop() || '').toLowerCase();
    const idx = indice(inv);
    let hojas;
    if (ext === 'csv' || ext === 'txt') {
      hojas = [tablaCSV(await archivo.text())];
    } else if (ext === 'xls') {
      throw errorUsuario('El formato .xls antiguo no se puede leer. Ábrelo en Excel y guárdalo como .xlsx.');
    } else if (ext === 'numbers' || ext === 'ods') {
      throw errorUsuario('Exporta el archivo como Excel (.xlsx) y vuelve a subirlo.');
    } else {
      const ExcelJS = await cargarExcelJS();
      const wb = new ExcelJS.Workbook();
      try {
        await wb.xlsx.load(await archivo.arrayBuffer());
      } catch (e) {
        throw errorUsuario('No se pudo abrir el archivo. ¿Es un Excel (.xlsx) válido?');
      }
      const tema = temaDelLibro(wb);
      hojas = [];
      wb.eachSheet((ws) => {
        if (ws.state === 'hidden' || ws.state === 'veryHidden') return;
        hojas.push(modeloHoja(ws, tema));
      });
    }
    if (!hojas.length) throw errorUsuario('El archivo no tiene hojas con datos.');

    // 1) Tracker (por colores): la mejor hoja de cada torre
    const trackers = {};
    for (const h of hojas) {
      const t = leerTracker(h, inv, idx);
      if (!t) continue;
      const prev = trackers[t.torre];
      const preferida = (x) => /precio|diagrama/.test(norm(x.hoja));
      if (!prev || t.coincidencias > prev.coincidencias || (t.coincidencias === prev.coincidencias && preferida(t) && !preferida(prev))) {
        trackers[t.torre] = t;
      }
    }
    const usables = Object.values(trackers).filter((t) => t.coincidencias > 0);
    if (usables.length) {
      const cambios = {};
      const avisos = [];
      for (const t of usables) {
        for (const c of t.celdas) {
          const u = idx.buscar(t.torre, c.nivel, c.pos);
          if (!u) {
            avisos.push(`Fila ${c.fila} (${t.hoja}): no existe la posición ${c.pos} del nivel ${c.nivel} en ${inv.torres[t.torre].nombre}.`);
            continue;
          }
          const d = datosDeCeldaTracker(c.texto);
          if (norm(d.modelo) !== norm(u.modelo)) {
            avisos.push(`Fila ${c.fila} (${t.hoja}): se esperaba «${u.modelo}» en ${u.id} y dice «${d.modelo}». Se tomó solo la disponibilidad.`);
            cambios[u.id] = { d: disponiblePorColor(c.color) };
            continue;
          }
          const datos = {};
          if (d.area !== undefined && d.area !== null) datos.area = Math.round(d.area * 100) / 100;
          if (d.hab !== undefined) datos.hab = d.hab;
          if (d.precio !== undefined) datos.precio = d.precio === null ? null : Math.round(d.precio);
          if (d.jacuzzi) datos.jacuzzi = true;
          cambios[u.id] = { d: disponiblePorColor(c.color), datos };
        }
      }
      return {
        formato: 'tracker',
        detalle: 'Colores de celda en ' + usables.map((t) => '«' + t.hoja + '»').join(' y '),
        torres: usables.map((t) => t.torre).sort(),
        cambios,
        implicito: false,
        avisos,
      };
    }

    // 2) Plantilla o lista
    const cambios = {};
    const avisos = [];
    const torres = new Set();
    let conEstado = false;
    const usadas = [];
    const tablas = hojas
      .filter((h) => !/^(instrucciones|leyenda|ayuda|notas|clientes)\b/.test(norm(h.nombre)))
      .map((h) => leerTabla(h, inv, idx))
      .filter(Boolean);
    const hayEncabezados = tablas.some((t) => t.conEncabezado);
    for (const t of tablas) {
      if (hayEncabezados && !t.conEncabezado) continue;
      usadas.push(t.hoja);
      conEstado = conEstado || t.conEstado;
      avisos.push(...t.avisos);
      for (const f of t.filas) {
        const id = f.unidad.id;
        torres.add(id.slice(0, 2));
        const c = cambios[id] || (cambios[id] = {});
        if (f.d !== undefined) c.d = f.d;
        else if (!t.conEstado) c.d = true;
        if (f.e !== undefined) c.e = f.e;
        if (f.datos && Object.keys(f.datos).length) c.datos = Object.assign(c.datos || {}, f.datos);
      }
    }
    if (!Object.keys(cambios).length) {
      throw errorUsuario('No se encontraron unidades en el archivo. Usa la plantilla o una lista con códigos como T2-801.');
    }
    return {
      formato: conEstado ? 'plantilla' : 'lista',
      detalle: conEstado ? 'Columna de disponibilidad en ' + usadas.map((n) => '«' + n + '»').join(', ') : 'Lista de unidades disponibles',
      torres: Array.from(torres).sort(),
      cambios,
      implicito: !conEstado,
      avisos,
    };
  }

  /** Aplica los cambios al estado. Devuelve cuántos datos (precio, m², etc.) cambiaron. */
  function aplicar(estado, inv, res) {
    let datosCambiados = 0;
    for (const t of res.torres) {
      for (const u of inv.torres[t].unidades) {
        const c = res.cambios[u.id];
        const sel = estado.unidades[u.id];
        if (res.implicito) sel.d = !!(c && c.d);
        else if (c && c.d !== undefined) sel.d = c.d;
        if (c && c.e !== undefined) sel.e = c.e;
        if (c && c.datos) {
          const actual = Object.assign({}, estado.datos[u.id] || {});
          for (const campo of CDM.estado.CAMPOS) {
            if (!(campo in c.datos)) continue;
            const antes = campo in actual ? actual[campo] : u[campo];
            const nuevo = c.datos[campo];
            if (nuevo !== antes) datosCambiados++;
            if (nuevo === u[campo]) delete actual[campo];
            else actual[campo] = nuevo;
          }
          if (Object.keys(actual).length) estado.datos[u.id] = actual;
          else delete estado.datos[u.id];
        }
      }
    }
    return datosCambiados;
  }

  // ------------------------------------------------------------------ plantilla
  async function plantilla(estado, inv) {
    const ExcelJS = await cargarExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Disponibilidad Casa de Mar';
    wb.created = new Date();
    const ws = wb.addWorksheet('Disponibilidad', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'Código', key: 'codigo', width: 11 },
      { header: 'Torre', key: 'torre', width: 9 },
      { header: 'Nivel', key: 'nivel', width: 8 },
      { header: 'Posición', key: 'pos', width: 10 },
      { header: 'Modelo', key: 'modelo', width: 22 },
      { header: 'Área (m²)', key: 'area', width: 11, style: { numFmt: '0.00' } },
      { header: 'Habitaciones', key: 'hab', width: 13 },
      { header: 'Jacuzzi', key: 'jacuzzi', width: 9 },
      { header: 'Precio (USD)', key: 'precio', width: 14, style: { numFmt: '"$"#,##0' } },
      { header: 'Disponible', key: 'disponible', width: 12 },
      { header: 'Destacar', key: 'destacar', width: 11 },
    ];
    for (const torre of Object.values(inv.torres)) {
      const r = CDM.estado.resolver(estado, inv, torre.id);
      for (const nivel of torre.niveles) {
        for (const u of r.unidades.filter((x) => x.nivel === nivel.clave).sort((a, b) => a.pos - b.pos)) {
          ws.addRow({
            codigo: u.id,
            torre: torre.nombre,
            nivel: u.nivel === 'PH' ? 'PH' : Number(u.nivel),
            pos: u.pos,
            modelo: u.modelo,
            area: u.area,
            hab: u.hab,
            jacuzzi: u.jacuzzi ? 'Sí' : 'No',
            precio: u.precio === null || u.precio === undefined ? 'Consultar' : u.precio,
            disponible: u.disponible ? 'Sí' : 'No',
            destacar: u.disponible && u.destacado ? 'Sí' : 'No',
          });
        }
      }
    }
    const cab = ws.getRow(1);
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D1D1B' } };
    cab.alignment = { vertical: 'middle' };
    cab.height = 20;
    const ultima = ws.rowCount;
    for (let r = 2; r <= ultima; r++) {
      for (const col of ['H', 'J', 'K']) {
        ws.getCell(col + r).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Sí,No"'] };
      }
      for (const col of ['J', 'K']) ws.getCell(col + r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F7EF' } };
    }
    ws.autoFilter = { from: 'A1', to: 'K1' };
    const ins = wb.addWorksheet('Instrucciones');
    ins.getColumn(1).width = 100;
    [
      'Cómo usar esta plantilla',
      '',
      '1. En la hoja «Disponibilidad», escribe Sí o No en la columna Disponible (las celdas tienen lista desplegable).',
      '2. Escribe Sí en Destacar para mostrar la unidad con estrella. Solo se destacan unidades disponibles.',
      '3. Si cambian precios, áreas, habitaciones o jacuzzi, corrígelos aquí: la app los toma al subir el archivo.',
      '4. No cambies la columna Código: es la que identifica cada apartamento (T1-901 = Torre 1, nivel 9, posición 1 de izquierda a derecha).',
      '5. Guarda el archivo como .xlsx y súbelo en la app, en la pestaña «Subir Excel».',
    ].forEach((t, i) => {
      const c = ins.getCell('A' + (i + 1));
      c.value = t;
      if (i === 0) c.font = { bold: true, size: 13 };
      c.alignment = { wrapText: true };
    });
    return wb.xlsx.writeBuffer();
  }

  CDM.excel = { leerArchivo, aplicar, plantilla, _internas: { disponiblePorColor, conTinte, numero, datosDeCeldaTracker } };
})();
