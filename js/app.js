/* Interfaz de la app de disponibilidad. */
(function () {
  'use strict';
  const CDM = window.CDM;
  const F = CDM.formato;
  const inv = CDM.inventario;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  let estado = null;
  let metricas = null;
  let fuentes = null;
  let previo = null; // estado antes de la última importación de Excel (para deshacer)
  let resaltada = null;
  const fotos = {};

  async function binario(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`No se pudo cargar ${url} (error ${r.status}).`);
    return r.arrayBuffer();
  }

  function iconoEstrella() {
    const e = CDM.geometria.estrella;
    return `<svg viewBox="-0.08 -0.08 1.16 ${(e.alto + 0.16).toFixed(3)}" aria-hidden="true"><path d="${e.d}"/></svg>`;
  }

  // ------------------------------------------------------------------ inicio
  async function iniciar() {
    try {
      if (!window.PDFLib || !window.fontkit) throw new Error('No se cargaron las librerías para crear el PDF.');
      const [writer, mori] = await Promise.all([binario('assets/fonts/PPWriter-ThinText.otf'), binario('assets/fonts/PPMori-Extralight.otf')]);
      fuentes = { writer, mori };
      const caras = [new FontFace('CDM Writer', writer.slice(0)), new FontFace('CDM Mori', mori.slice(0))];
      await Promise.all(caras.map((c) => c.load()));
      caras.forEach((c) => document.fonts.add(c));
      metricas = new CDM.Metricas({
        writer: await window.fontkit.create(new Uint8Array(writer)),
        mori: await window.fontkit.create(new Uint8Array(mori)),
      });
      estado = CDM.estado.cargar(inv);
      const logo = CDM.geometria.logo;
      $('#marcaLogo').innerHTML = `<svg viewBox="0 0 ${logo.ancho} ${logo.alto}" role="img" aria-label="Casa de Mar · Residence Sunzal"><path d="${logo.d}"/></svg>`;
      enlazar();
      aplicarOpciones();
      construirLista();
      render();
      $('#cargando').hidden = true;
      document.documentElement.dataset.listo = 'si';
    } catch (e) {
      console.error(e);
      const local = location.protocol === 'file:';
      $('#cargando').innerHTML =
        '<div class="carga-error"><p class="carga-titulo">No se pudo abrir la app</p><p>' +
        (local
          ? 'Abriste index.html directamente desde la carpeta. Ábrela desde su dirección de GitHub Pages o con un servidor local (las instrucciones están en el README).'
          : F.html(e.message)) +
        '</p></div>';
      document.documentElement.dataset.listo = 'error';
    }
  }

  // ------------------------------------------------------------------ dibujo
  function escenaDe(torreId, fecha) {
    return CDM.escena.construir(torreId, { torre: CDM.estado.resolver(estado, inv, torreId), metricas, fecha });
  }

  function render(guardadoOk = true) {
    const t = estado.opciones.torre;
    const c = CDM.estado.contar(estado, inv, t);
    $('#vista').innerHTML = CDM.render.svg(escenaDe(t, estado.opciones.fecha ? new Date() : null), {
      fotos: { T1: CDM.geometria.torres.T1.fotoPreview, T2: CDM.geometria.torres.T2.fotoPreview },
      etiqueta: `Vista previa: ${inv.torres[t].titulo}, ${c.disponibles} unidades disponibles`,
    });
    if (resaltada) marcar(resaltada);
    actualizarLista();
    for (const id of ['T1', 'T2']) {
      const ci = CDM.estado.contar(estado, inv, id);
      const el = $(`[data-cuenta-torre="${id}"]`);
      el.textContent = ci.disponibles;
      el.title = `${ci.disponibles} de ${ci.total} disponibles`;
    }
    $('#resumen').textContent = `${c.disponibles} de ${c.total} disponibles` + (c.destacadas ? ` · ${c.destacadas} con estrella` : '');
    const g = $('#guardado');
    g.classList.toggle('es-error', !guardadoOk);
    g.textContent = !guardadoOk
      ? 'No se pudo guardar en este navegador (¿modo privado?). Los cambios se perderán al cerrar.'
      : estado.actualizado
        ? `Guardado en este navegador · ${F.fechaHora(new Date(estado.actualizado))}`
        : 'Selección inicial tomada del Excel de inventario.';
  }

  function construirLista() {
    const torre = inv.torres[estado.opciones.torre];
    const estrella = iconoEstrella();
    $('#lista').innerHTML = torre.niveles
      .map((nivel) => {
        const filas = torre.unidades
          .filter((u) => u.nivel === nivel.clave)
          .sort((a, b) => a.pos - b.pos)
          .map(
            (u) => `<li class="fila" data-unidad="${u.id}">
              <label class="fila-check">
                <input type="checkbox" class="cb" data-accion="disponible" data-unidad="${u.id}">
                <span class="fila-texto"><span class="fila-nombre">${F.html(u.nombre)}</span><span class="fila-meta">${u.id} · <span data-area></span></span></span>
              </label>
              <span class="fila-precio" data-precio></span>
              <button type="button" class="estrella" data-accion="estrella" data-unidad="${u.id}" aria-pressed="false">${estrella}</button>
            </li>`,
          )
          .join('');
        return `<section class="nivel" data-nivel="${nivel.clave}">
          <div class="nivel-cab">
            <h3>${F.html(nivel.nombre)}</h3>
            <span class="nivel-cuenta" data-cuenta></span>
            <label class="nivel-todas"><input type="checkbox" class="cb cb-chica" data-accion="nivel" data-nivel="${nivel.clave}"><span>Todas</span></label>
          </div>
          <ul class="unidades">${filas}</ul>
        </section>`;
      })
      .join('');
  }

  function actualizarLista() {
    const r = CDM.estado.resolver(estado, inv, estado.opciones.torre);
    const porId = new Map(r.unidades.map((u) => [u.id, u]));
    for (const li of $$('#lista .fila')) {
      const u = porId.get(li.dataset.unidad);
      if (!u) continue;
      const cb = li.querySelector('.cb');
      cb.checked = u.disponible;
      cb.setAttribute('aria-label', `${u.id} ${u.nombre}, disponible`);
      li.classList.toggle('es-disp', u.disponible);
      li.querySelector('[data-area]').textContent = F.area(u.area);
      li.querySelector('[data-precio]').textContent = F.precio(u.precio);
      const b = li.querySelector('.estrella');
      const activa = u.disponible && u.destacado;
      b.setAttribute('aria-pressed', String(activa));
      b.disabled = !u.disponible;
      b.title = u.disponible ? (activa ? 'Quitar estrella' : 'Destacar con estrella') : 'Márcala como disponible para poder destacarla';
      b.setAttribute('aria-label', `Destacar ${u.id} ${u.nombre} con estrella`);
    }
    for (const sec of $$('#lista .nivel')) {
      const us = r.unidades.filter((u) => u.nivel === sec.dataset.nivel);
      const n = us.filter((u) => u.disponible).length;
      sec.querySelector('[data-cuenta]').textContent = `${n} de ${us.length}`;
      const cb = sec.querySelector('[data-accion="nivel"]');
      cb.checked = n === us.length;
      cb.indeterminate = n > 0 && n < us.length;
      cb.setAttribute('aria-label', `Todas las unidades del ${sec.querySelector('h3').textContent} disponibles`);
    }
  }

  function aplicarOpciones() {
    const o = estado.opciones;
    for (const b of $$('.torre-tab')) b.setAttribute('aria-pressed', String(b.dataset.torre === o.torre));
    for (const b of $$('.modo')) b.setAttribute('aria-pressed', String(b.dataset.modo === o.modo));
    $('#panelManual').hidden = o.modo !== 'manual';
    $('#panelExcel').hidden = o.modo !== 'excel';
    $('#exportarSel').value = o.exportar;
    $('#optFecha').checked = o.fecha;
  }

  // ------------------------------------------------------------------ cambios
  function cambiar(fn, origen = 'manual') {
    fn();
    estado.actualizado = new Date().toISOString();
    estado.origen = origen;
    render(CDM.estado.guardar(estado));
  }

  function guardarOpciones() {
    CDM.estado.guardar(estado);
  }

  function resaltar(id) {
    if (id === resaltada) return;
    resaltada = id;
    for (const el of $$('#vista .resaltada, #lista .resaltada')) el.classList.remove('resaltada');
    if (id) marcar(id);
  }

  function marcar(id) {
    const p = $(`#vista [data-unidad="${id}"]`);
    if (p) p.classList.add('resaltada');
    const li = $(`#lista .fila[data-unidad="${id}"]`);
    if (li) li.classList.add('resaltada');
  }

  let temporizador = null;
  function aviso(texto, tipo) {
    const el = $('#aviso');
    el.textContent = texto;
    el.className = 'aviso visible' + (tipo === 'error' ? ' es-error' : '');
    clearTimeout(temporizador);
    temporizador = setTimeout(() => (el.className = 'aviso'), tipo === 'error' ? 7000 : 3000);
  }

  function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // ------------------------------------------------------------------ PDF
  function fotoHD(t) {
    if (!fotos[t]) {
      fotos[t] = binario(CDM.geometria.torres[t].foto).catch((e) => {
        delete fotos[t];
        throw e;
      });
    }
    return fotos[t];
  }

  async function exportarPDF() {
    const btn = $('#btnPdf');
    const sel = estado.opciones.exportar;
    const torres = sel === 'ambas' ? ['T1', 'T2'] : [sel];
    const fecha = new Date();
    const texto = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Generando…';
    try {
      const bytes = await CDM.render.pdf({
        torres,
        escena: (t) => escenaDe(t, estado.opciones.fecha ? fecha : null),
        fuentes,
        fotoHD,
        titulo: `Disponibilidad Casa de Mar · ${torres.map((t) => inv.torres[t].nombre).join(' y ')} · ${F.fechaLarga(fecha)}`,
      });
      const quien = torres.length === 2 ? 'Torres-1-y-2' : inv.torres[torres[0]].nombre.replace(' ', '-');
      descargar(new Blob([bytes], { type: 'application/pdf' }), `Casa-de-Mar_Disponibilidad_${quien}_${F.fechaArchivo(fecha)}.pdf`);
      const vacias = torres.filter((t) => !CDM.estado.contar(estado, inv, t).disponibles);
      aviso(vacias.length ? `PDF descargado. ${vacias.map((t) => inv.torres[t].nombre).join(' y ')} no tiene unidades disponibles.` : 'PDF descargado');
    } catch (e) {
      console.error(e);
      aviso('No se pudo generar el PDF: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = texto;
    }
  }

  // ------------------------------------------------------------------ Excel
  async function importar(archivo) {
    const zona = $('#zonaSoltar');
    zona.classList.add('leyendo');
    $('#estadoSoltar').textContent = `Leyendo ${archivo.name}…`;
    try {
      const res = await CDM.excel.leerArchivo(archivo, inv);
      const antes = JSON.parse(JSON.stringify(estado));
      let datos = 0;
      cambiar(() => {
        datos = CDM.excel.aplicar(estado, inv, res);
      }, 'excel');
      previo = antes;
      mostrarResultado(archivo.name, res, datos);
      aviso('Excel aplicado');
    } catch (e) {
      if (!e.usuario) console.error(e);
      const el = $('#resultadoExcel');
      el.innerHTML = `<p class="resultado-titulo">No se pudo usar «${F.html(archivo.name)}»</p><p class="resultado-detalle">${F.html(e.message)}</p>`;
      el.classList.add('es-error');
      el.hidden = false;
    } finally {
      zona.classList.remove('leyendo');
      $('#estadoSoltar').textContent = '';
    }
  }

  function mostrarResultado(nombre, res, datos) {
    const el = $('#resultadoExcel');
    const torres = res.torres.map((t) => {
      const c = CDM.estado.contar(estado, inv, t);
      return `<li><strong>${inv.torres[t].nombre}:</strong> ${c.disponibles} de ${c.total} disponibles${c.destacadas ? `, ${c.destacadas} con estrella` : ''}</li>`;
    });
    const fuera = ['T1', 'T2'].filter((t) => !res.torres.includes(t));
    if (fuera.length) torres.push(`<li>${fuera.map((t) => inv.torres[t].nombre).join(' y ')}: sin cambios, no aparece en el archivo</li>`);
    torres.push(`<li>${datos ? `${datos} ${datos === 1 ? 'dato actualizado' : 'datos actualizados'} (precio, m², habitaciones o jacuzzi)` : 'Precios y datos sin cambios'}</li>`);
    const avisos = res.avisos.length
      ? `<details class="resultado-avisos"><summary>${res.avisos.length} ${res.avisos.length === 1 ? 'aviso' : 'avisos'}</summary><ul>${res.avisos
          .slice(0, 60)
          .map((a) => `<li>${F.html(a)}</li>`)
          .join('')}</ul></details>`
      : '';
    el.innerHTML = `<p class="resultado-titulo">Listo: se aplicó «${F.html(nombre)}»</p>
      <p class="resultado-detalle">${F.html(res.detalle)}.</p>
      <ul class="resultado-lista">${torres.join('')}</ul>${avisos}
      <div class="resultado-acciones">
        <button type="button" class="btn btn-secundario" data-accion="revisar">Revisar selección</button>
        <button type="button" class="btn-texto" data-accion="deshacer">Deshacer</button>
      </div>`;
    el.classList.remove('es-error');
    el.hidden = false;
  }

  async function descargarPlantilla() {
    const btn = $('#btnPlantilla');
    btn.disabled = true;
    try {
      const buf = await CDM.excel.plantilla(estado, inv);
      descargar(
        new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `Casa-de-Mar_Plantilla-disponibilidad_${F.fechaArchivo(new Date())}.xlsx`,
      );
    } catch (e) {
      console.error(e);
      aviso('No se pudo crear la plantilla: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  // ------------------------------------------------------------------ eventos
  function enlazar() {
    for (const b of $$('.torre-tab')) {
      b.addEventListener('click', () => {
        if (estado.opciones.torre === b.dataset.torre) return;
        estado.opciones.torre = b.dataset.torre;
        guardarOpciones();
        resaltada = null;
        aplicarOpciones();
        construirLista();
        render();
      });
    }
    for (const b of $$('.modo')) {
      b.addEventListener('click', () => {
        estado.opciones.modo = b.dataset.modo;
        guardarOpciones();
        aplicarOpciones();
      });
    }

    const lista = $('#lista');
    lista.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset.accion === 'disponible') {
        cambiar(() => (estado.unidades[el.dataset.unidad].d = el.checked));
      } else if (el.dataset.accion === 'nivel') {
        const valor = el.checked;
        cambiar(() => {
          for (const u of inv.torres[estado.opciones.torre].unidades) if (u.nivel === el.dataset.nivel) estado.unidades[u.id].d = valor;
        });
      }
    });
    lista.addEventListener('click', (e) => {
      const b = e.target.closest('[data-accion="estrella"]');
      if (!b || b.disabled) return;
      cambiar(() => {
        const s = estado.unidades[b.dataset.unidad];
        s.e = !s.e;
      });
    });
    lista.addEventListener('pointerover', (e) => {
      const li = e.target.closest('.fila');
      resaltar(li ? li.dataset.unidad : null);
    });
    lista.addEventListener('pointerleave', () => resaltar(null));

    const vista = $('#vista');
    vista.addEventListener('click', (e) => {
      const p = e.target.closest('[data-unidad]');
      if (!p) return;
      const id = p.dataset.unidad;
      cambiar(() => (estado.unidades[id].d = !estado.unidades[id].d));
      const u = inv.torres[estado.opciones.torre].unidades.find((x) => x.id === id);
      aviso(`${id} ${u ? u.nombre : ''}: ${estado.unidades[id].d ? 'disponible' : 'reservado'}`);
      const li = $(`#lista .fila[data-unidad="${id}"]`);
      if (li && estado.opciones.modo === 'manual') {
        li.scrollIntoView({ block: 'nearest' });
        li.classList.remove('destello');
        void li.offsetWidth;
        li.classList.add('destello');
      }
    });
    vista.addEventListener('pointerover', (e) => {
      const p = e.target.closest('[data-unidad]');
      resaltar(p ? p.dataset.unidad : null);
    });
    vista.addEventListener('pointerleave', () => resaltar(null));

    $('#accionesRapidas').addEventListener('click', (e) => {
      const b = e.target.closest('[data-accion]');
      if (!b) return;
      const unidades = inv.torres[estado.opciones.torre].unidades;
      if (b.dataset.accion === 'todas') cambiar(() => unidades.forEach((u) => (estado.unidades[u.id].d = true)));
      if (b.dataset.accion === 'ninguna') cambiar(() => unidades.forEach((u) => (estado.unidades[u.id].d = false)));
      if (b.dataset.accion === 'sin-estrellas') cambiar(() => unidades.forEach((u) => (estado.unidades[u.id].e = false)));
    });

    $('#btnRestablecer').addEventListener('click', () => {
      if (!window.confirm('¿Volver a la disponibilidad del Excel de inventario? Se borran la selección, las estrellas y los datos cargados en este navegador.')) return;
      const opciones = estado.opciones;
      estado = CDM.estado.porDefecto(inv);
      estado.opciones = opciones;
      previo = null;
      $('#resultadoExcel').hidden = true;
      cambiar(() => {}, 'inventario');
      aviso('Se restableció el inventario original');
    });

    $('#exportarSel').addEventListener('change', (e) => {
      estado.opciones.exportar = e.target.value;
      guardarOpciones();
    });
    $('#btnPdf').addEventListener('click', exportarPDF);
    $('#optFecha').addEventListener('change', (e) => {
      estado.opciones.fecha = e.target.checked;
      guardarOpciones();
      render();
    });

    const input = $('#archivoExcel');
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) importar(input.files[0]);
      input.value = '';
    });
    $('#btnElegir').addEventListener('click', () => input.click());
    const zona = $('#zonaSoltar');
    zona.addEventListener('click', (e) => {
      if (e.target === zona) input.click();
    });
    ['dragenter', 'dragover'].forEach((ev) =>
      zona.addEventListener(ev, (e) => {
        e.preventDefault();
        zona.classList.add('encima');
      }),
    );
    ['dragleave', 'drop'].forEach((ev) =>
      zona.addEventListener(ev, (e) => {
        e.preventDefault();
        zona.classList.remove('encima');
      }),
    );
    zona.addEventListener('drop', (e) => {
      const f = e.dataTransfer && e.dataTransfer.files[0];
      if (f) importar(f);
    });
    $('#btnPlantilla').addEventListener('click', descargarPlantilla);
    $('#resultadoExcel').addEventListener('click', (e) => {
      const b = e.target.closest('[data-accion]');
      if (!b) return;
      if (b.dataset.accion === 'revisar') {
        estado.opciones.modo = 'manual';
        guardarOpciones();
        aplicarOpciones();
      } else if (b.dataset.accion === 'deshacer' && previo) {
        const opciones = estado.opciones;
        estado = previo;
        estado.opciones = opciones;
        previo = null;
        $('#resultadoExcel').hidden = true;
        cambiar(() => {}, 'manual');
        aviso('Se deshizo la importación');
      }
    });
  }

  // Acceso para pruebas automatizadas
  CDM.app = {
    get estado() {
      return estado;
    },
    escenaDe,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
