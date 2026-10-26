/* Diagramación de la ficha 16:9.
   Produce una «escena»: una lista de elementos (imagen, trazos, textos, líneas, rectángulos) en puntos,
   con origen arriba a la izquierda. La vista previa (SVG) y el PDF dibujan la misma escena,
   así lo que se ve en pantalla es exactamente lo que sale en el PDF. */
(function () {
  'use strict';
  const CDM = (window.CDM = window.CDM || {});
  const F = CDM.formato;

  const PAGINA = { ancho: 1280, alto: 720 }; // 16:9

  // Medidas base de la ficha (escala 1). La lista se escala para ocupar el espacio sin desbordarse.
  const B = {
    margen: 44,
    logoAncho: 232,
    logoArriba: 46,
    tituloTam: 40,
    tituloBase: 50, // del borde inferior del logo a la línea base del título
    listaArriba: 34, // de la línea base del título al inicio de la lista
    pieBase: 38, // de la línea base de la leyenda al borde inferior
    pieAire: 26, // aire mínimo entre la lista y la leyenda
    leyendaTam: 13.5,
    muestraAncho: 34,
    muestraAlto: 12,
    fechaTam: 9.5,
    nivelTam: 15.5,
    cuentaTam: 10.2,
    encTam: 8.4,
    filaTam: 11,
    hNivel: 12.5,
    gLinea: 7,
    hEnc: 13.5,
    gGuiones: 6.5,
    hPrimera: 15,
    paso: 17,
    colchon: 4.5,
    gapBloques: 20,
    gapCol: 10,
    canal: 28,
    gapExtraMax: 1.3, // cuánto puede crecer el espacio entre niveles para no dejar aire abajo
    escalaMax: 1.22,
    linea: 0.7,
    guion: 0.4,
    guionPatron: [1.8, 1.8],
  };
  const COLOR = { texto: '#1D1D1B', enc: '#66665F', leyenda: '#282828', fecha: '#77776F', vacio: '#77776F', estrella: '#DDC517' };
  const ENCABEZADOS = ['Unidad', 'Mts²', 'Habitaciones', 'Jacuzzi', 'Precio'];
  const ETIQUETA_FACTOR = 1.04; // PP Mori Extralight es más fina que la Helvetica original

  const texto = (text, font, size, x, y, anchor, color) => ({ t: 'text', text, font, size, x, y, anchor, color });
  const linea = (x1, y1, x2, y2, w, color, dash) => ({ t: 'line', x1, y1, x2, y2, w, color, dash: dash || null });

  function estrella(items, x, y, lado) {
    const e = CDM.geometria.estrella;
    items.push({ t: 'path', d: e.d, tx: x, ty: y, s: lado, fill: e.color || COLOR.estrella });
  }

  function altoBloque(n) {
    return B.hNivel + B.gLinea + B.hEnc + B.gGuiones + B.hPrimera + (n - 1) * B.paso + B.colchon;
  }

  /** Anchos naturales (escala 1) de las columnas de la tabla, según lo que se va a mostrar. */
  function medirTabla(bloques, M) {
    const enc = (s) => M.ancho('mori', s, B.encTam);
    const fila = (s) => M.ancho('mori', s, B.filaTam);
    let wN = enc(ENCABEZADOS[0]);
    let wA = enc(ENCABEZADOS[1]);
    let wH = enc(ENCABEZADOS[2]);
    let wJ = enc(ENCABEZADOS[3]);
    let wP = enc(ENCABEZADOS[4]);
    let wCab = 0;
    for (const b of bloques) {
      wCab = Math.max(wCab, M.ancho('writer', b.nombre, B.nivelTam) + 16 + M.ancho('mori', F.unidades(b.unidades.length), B.cuentaTam));
      for (const u of b.unidades) {
        wN = Math.max(wN, fila(u.nombre));
        wA = Math.max(wA, fila(F.area(u.area)));
        wH = Math.max(wH, fila(F.hab(u.hab)));
        wJ = Math.max(wJ, fila(F.jacuzzi(u.jacuzzi)));
        wP = Math.max(wP, fila(F.precio(u.precio)));
      }
    }
    return { wN, wA, wH, wJ, wP, natural: Math.max(wN + wA + wH + wJ + wP + 4 * B.gapCol, wCab) };
  }

  /** Filas de bloques: una columna, o dos columnas en orden de lectura (si son impares, el primero va solo y centrado). */
  function filasDeBloques(n, columnas) {
    const filas = [];
    if (columnas === 1) {
      for (let i = 0; i < n; i++) filas.push([i]);
      return filas;
    }
    let i = 0;
    if (n % 2 === 1) {
      filas.push([0]);
      i = 1;
    }
    for (; i < n; i += 2) filas.push([i, i + 1]);
    return filas;
  }

  /** Elige 1 o 2 columnas y la escala más grande que entra completa en el espacio disponible. */
  function planificar(bloques, med, caja) {
    const opciones = [];
    for (const columnas of [1, 2]) {
      if (columnas === 2 && bloques.length < 2) continue;
      const filas = filasDeBloques(bloques.length, columnas);
      const alto1 =
        filas.reduce((s, f) => s + Math.max(...f.map((i) => altoBloque(bloques[i].unidades.length))), 0) + (filas.length - 1) * B.gapBloques;
      const anchoCol = columnas === 1 ? caja.ancho : (caja.ancho - B.canal) / 2;
      const escala = Math.min(B.escalaMax, caja.alto / alto1, anchoCol / med.natural);
      opciones.push({ columnas, filas, alto1, anchoCol, escala });
    }
    opciones.sort((a, b) => b.escala - a.escala || a.columnas - b.columnas);
    return opciones[0];
  }

  function dibujarBloque(items, b, x, y, ancho, s, med) {
    const t = (v) => v * s;
    const yNivel = y + t(B.hNivel);
    items.push(texto(b.nombre, 'writer', t(B.nivelTam), x, yNivel, 'start', COLOR.texto));
    items.push(texto(F.unidades(b.unidades.length), 'mori', t(B.cuentaTam), x + ancho, yNivel, 'end', COLOR.texto));
    const yLinea = yNivel + t(B.gLinea);
    items.push(linea(x, yLinea, x + ancho, yLinea, t(B.linea), COLOR.texto));

    const hueco = (ancho - t(med.wN + med.wA + med.wH + med.wJ + med.wP)) / 4;
    const xArea = x + t(med.wN) + hueco;
    const xHab = xArea + t(med.wA) + hueco + t(med.wH) / 2;
    const xJac = xArea + t(med.wA) + hueco + t(med.wH) + hueco + t(med.wJ) / 2;
    const xPrecio = x + ancho;

    const yEnc = yLinea + t(B.hEnc);
    const enc = t(B.encTam);
    items.push(texto(ENCABEZADOS[0], 'mori', enc, x, yEnc, 'start', COLOR.enc));
    items.push(texto(ENCABEZADOS[1], 'mori', enc, xArea, yEnc, 'start', COLOR.enc));
    items.push(texto(ENCABEZADOS[2], 'mori', enc, xHab, yEnc, 'middle', COLOR.enc));
    items.push(texto(ENCABEZADOS[3], 'mori', enc, xJac, yEnc, 'middle', COLOR.enc));
    items.push(texto(ENCABEZADOS[4], 'mori', enc, xPrecio, yEnc, 'end', COLOR.enc));
    const yGuiones = yEnc + t(B.gGuiones);
    items.push(linea(x, yGuiones, x + ancho, yGuiones, t(B.guion), COLOR.texto, B.guionPatron.map(t)));

    const tam = t(B.filaTam);
    let yFila = yGuiones + t(B.hPrimera);
    for (const u of b.unidades) {
      if (u.destacado) {
        const lado = tam * 0.78;
        const altoEstrella = lado * CDM.geometria.estrella.alto;
        estrella(items, x - tam * 0.42 - lado, yFila - tam * 0.36 - altoEstrella / 2, lado);
      }
      items.push(texto(u.nombre, 'mori', tam, x, yFila, 'start', COLOR.texto));
      items.push(texto(F.area(u.area), 'mori', tam, xArea, yFila, 'start', COLOR.texto));
      items.push(texto(F.hab(u.hab), 'mori', tam, xHab, yFila, 'middle', COLOR.texto));
      items.push(texto(F.jacuzzi(u.jacuzzi), 'mori', tam, xJac, yFila, 'middle', COLOR.texto));
      items.push(texto(F.precio(u.precio), 'mori', tam, xPrecio, yFila, 'end', COLOR.texto));
      yFila += t(B.paso);
    }
  }

  /**
   * @param {string} torreId  'T1' | 'T2'
   * @param {{torre: object, metricas: {ancho: Function}, fecha: Date|null}} ctx
   */
  function construir(torreId, ctx) {
    const geo = CDM.geometria.torres[torreId];
    const torre = ctx.torre;
    const M = ctx.metricas;
    const W = PAGINA.ancho;
    const H = PAGINA.alto;
    const items = [];

    // ---- Foto con siluetas (lado izquierdo)
    const k = H / geo.alto;
    const anchoFoto = geo.ancho * k;
    items.push({ t: 'img', torre: torreId, x: 0, y: 0, w: anchoFoto, h: H });
    const est = geo.estilo;
    for (const u of torre.unidades) {
      const g = geo.unidades[u.id];
      if (!g) continue;
      items.push({
        t: 'path', d: g.d, tx: 0, ty: 0, s: k,
        fill: u.disponible ? est.verde : est.oscuro, fillOpacity: est.opacidad,
        stroke: '#FFFFFF', strokeWidth: est.borde, strokeOpacity: est.opacidad,
        unidad: u.id, disponible: u.disponible,
      });
    }
    for (const u of torre.unidades) {
      const g = geo.unidades[u.id];
      if (!g) continue;
      const tam = g.etiqueta.tam * k * ETIQUETA_FACTOR;
      const cx = g.etiqueta.cx * k;
      const base = g.etiqueta.base * k;
      items.push(texto(g.etiqueta.texto, 'mori', tam, cx, base, 'middle', '#FFFFFF'));
      if (u.disponible && u.destacado) {
        const ancho = M.ancho('mori', g.etiqueta.texto, tam);
        const lado = tam * 1.05;
        estrella(items, cx - ancho / 2 - tam * 0.38 - lado, base - tam * 0.35 - (lado * CDM.geometria.estrella.alto) / 2, lado);
      }
    }
    for (const n of geo.niveles) {
      items.push(texto(n.texto, 'writer', n.tam * k, n.x * k, n.base * k, 'start', '#FFFFFF'));
      if (n.flecha) items.push(linea(n.flecha.x1 * k, n.flecha.y * k, n.flecha.x2 * k, n.flecha.y * k, n.flecha.grosor * k, '#FFFFFF'));
      if (n.punta) items.push({ t: 'path', d: n.punta, tx: 0, ty: 0, s: k, fill: '#FFFFFF' });
    }

    // ---- Panel derecho
    const x0 = anchoFoto + B.margen;
    const x1 = W - B.margen;
    const ancho = x1 - x0;
    const centro = (anchoFoto + W) / 2;

    const logo = CDM.geometria.logo;
    const anchoLogo = Math.min(B.logoAncho, ancho);
    const escLogo = anchoLogo / logo.ancho;
    items.push({ t: 'path', d: logo.d, tx: centro - anchoLogo / 2, ty: B.logoArriba, s: escLogo, fill: '#000000' });

    let tamTitulo = B.tituloTam;
    const anchoTitulo = M.ancho('writer', torre.titulo, tamTitulo);
    if (anchoTitulo > ancho) tamTitulo *= ancho / anchoTitulo;
    const yTitulo = B.logoArriba + logo.alto * escLogo + B.tituloBase;
    items.push(texto(torre.titulo, 'writer', tamTitulo, centro, yTitulo, 'middle', COLOR.texto));

    const yPie = H - B.pieBase;
    const yMuestra = yPie - B.muestraAlto + 1.5;
    let xl = x0;
    for (const [rotulo, color] of [['Reservado', est.oscuro], ['Disponible', est.verde]]) {
      items.push({ t: 'rect', x: xl, y: yMuestra, w: B.muestraAncho, h: B.muestraAlto, fill: color });
      xl += B.muestraAncho + 9;
      items.push(texto(rotulo, 'writer', B.leyendaTam, xl, yPie, 'start', COLOR.leyenda));
      xl += M.ancho('writer', rotulo, B.leyendaTam) + 28;
    }
    if (ctx.fecha) items.push(texto('Disponibilidad al ' + F.fechaLarga(ctx.fecha), 'mori', B.fechaTam, x1, yPie, 'end', COLOR.fecha));

    const caja = { x: x0, y: yTitulo + B.listaArriba, ancho };
    caja.alto = yMuestra - B.pieAire - caja.y;

    const bloques = torre.niveles
      .map((n) => ({
        nombre: n.nombre,
        unidades: torre.unidades.filter((u) => u.nivel === n.clave && u.disponible).sort((a, b) => a.pos - b.pos),
      }))
      .filter((b) => b.unidades.length);

    let plan = null;
    if (!bloques.length) {
      items.push(texto('Sin unidades disponibles por el momento', 'writer', 20, centro, caja.y + caja.alto * 0.42, 'middle', COLOR.vacio));
    } else {
      const med = medirTabla(bloques, M);
      plan = planificar(bloques, med, caja);
      const s = plan.escala;
      // Si el ancho limita la escala, el aire sobrante se reparte entre niveles en vez de quedar abajo.
      let gap = B.gapBloques * s;
      const sobra = caja.alto - plan.alto1 * s;
      if (sobra > 0 && plan.filas.length > 1) gap += Math.min((sobra * 0.75) / (plan.filas.length - 1), B.gapBloques * s * B.gapExtraMax);
      const altoTotal = plan.alto1 * s + (gap - B.gapBloques * s) * (plan.filas.length - 1);
      let y = caja.y + Math.max(0, (caja.alto - altoTotal) * 0.38);
      for (const fila of plan.filas) {
        const altoFila = Math.max(...fila.map((i) => altoBloque(bloques[i].unidades.length))) * s;
        if (plan.columnas === 1) {
          dibujarBloque(items, bloques[fila[0]], x0, y, ancho, s, med);
        } else if (fila.length === 1) {
          dibujarBloque(items, bloques[fila[0]], x0 + (ancho - plan.anchoCol) / 2, y, plan.anchoCol, s, med);
        } else {
          dibujarBloque(items, bloques[fila[0]], x0, y, plan.anchoCol, s, med);
          dibujarBloque(items, bloques[fila[1]], x1 - plan.anchoCol, y, plan.anchoCol, s, med);
        }
        y += altoFila + gap;
      }
    }

    return {
      ancho: W,
      alto: H,
      items,
      anchoFoto,
      info: plan ? { columnas: plan.columnas, escala: plan.escala, niveles: bloques.length } : { columnas: 0, escala: 0, niveles: 0 },
    };
  }

  CDM.escena = { PAGINA, construir };
})();
