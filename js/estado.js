/* Estado de la selección (disponible / destacada) y datos actualizados por Excel.
   Se guarda en localStorage, así la selección sigue ahí al volver a abrir la app. */
(function () {
  'use strict';
  const CDM = (window.CDM = window.CDM || {});
  const CLAVE = 'cdm-disponibilidad-v1';
  const CAMPOS = ['area', 'hab', 'jacuzzi', 'precio'];

  function porDefecto(inv) {
    const estado = {
      version: 1,
      unidades: {}, // id -> { d: disponible, e: destacada }
      datos: {}, // id -> campos que difieren del inventario base (precio, área…)
      opciones: { torre: 'T1', modo: 'manual', exportar: 'ambas', fecha: true },
      actualizado: null,
      origen: 'inventario',
    };
    for (const torre of Object.values(inv.torres)) {
      for (const u of torre.unidades) estado.unidades[u.id] = { d: !!u.disponible, e: false };
    }
    return estado;
  }

  function limpiarDatos(v) {
    const out = {};
    if (!v || typeof v !== 'object') return out;
    for (const c of CAMPOS) {
      if (!(c in v)) continue;
      if (c === 'jacuzzi') out[c] = !!v[c];
      else if (v[c] === null) out[c] = null;
      else if (isFinite(v[c])) out[c] = Number(v[c]);
    }
    return out;
  }

  CDM.estado = {
    CAMPOS,
    porDefecto,

    cargar(inv) {
      const estado = porDefecto(inv);
      let guardado = null;
      try {
        guardado = JSON.parse(window.localStorage.getItem(CLAVE));
      } catch (e) {
        guardado = null;
      }
      if (!guardado || guardado.version !== 1) return estado;
      for (const [id, v] of Object.entries(guardado.unidades || {})) {
        if (estado.unidades[id] && v) estado.unidades[id] = { d: !!v.d, e: !!v.e };
      }
      for (const [id, v] of Object.entries(guardado.datos || {})) {
        if (estado.unidades[id]) {
          const limpio = limpiarDatos(v);
          if (Object.keys(limpio).length) estado.datos[id] = limpio;
        }
      }
      const op = guardado.opciones || {};
      if (op.torre === 'T1' || op.torre === 'T2') estado.opciones.torre = op.torre;
      if (op.modo === 'manual' || op.modo === 'excel') estado.opciones.modo = op.modo;
      if (['ambas', 'T1', 'T2'].includes(op.exportar)) estado.opciones.exportar = op.exportar;
      if (typeof op.fecha === 'boolean') estado.opciones.fecha = op.fecha;
      estado.actualizado = guardado.actualizado || null;
      estado.origen = guardado.origen || 'inventario';
      return estado;
    },

    /** Devuelve true si se pudo guardar en este navegador. */
    guardar(estado) {
      try {
        window.localStorage.setItem(CLAVE, JSON.stringify(estado));
        return true;
      } catch (e) {
        return false;
      }
    },

    /** Torre con sus unidades combinadas: inventario + datos de Excel + selección actual. */
    resolver(estado, inv, torreId) {
      const torre = inv.torres[torreId];
      const unidades = torre.unidades.map((u) => {
        const sel = estado.unidades[u.id] || { d: false, e: false };
        return Object.assign({}, u, estado.datos[u.id] || {}, { disponible: !!sel.d, destacado: !!sel.e });
      });
      return { id: torre.id, nombre: torre.nombre, titulo: torre.titulo, niveles: torre.niveles, unidades };
    },

    contar(estado, inv, torreId) {
      let disponibles = 0;
      let destacadas = 0;
      for (const u of inv.torres[torreId].unidades) {
        const s = estado.unidades[u.id];
        if (s && s.d) {
          disponibles++;
          if (s.e) destacadas++;
        }
      }
      return { disponibles, destacadas, total: inv.torres[torreId].unidades.length };
    },
  };
})();
