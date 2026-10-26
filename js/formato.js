/* Formatos de texto compartidos por la vista previa, el PDF y el Excel. */
(function () {
  'use strict';
  const CDM = (window.CDM = window.CDM || {});
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const miles = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const valido = (v) => v !== null && v !== undefined && v !== '' && isFinite(v);

  CDM.formato = {
    precio: (p) => (valido(p) ? '$' + miles(p) : 'Consultar'),
    area: (a) => (valido(a) ? Number(a).toFixed(2) + ' m²' : '—'),
    hab: (h) => (valido(h) ? String(h) : '—'),
    jacuzzi: (j) => (j ? 'Sí' : 'No'),
    unidades: (n) => (n === 1 ? '1 unidad' : n + ' unidades'),
    fechaLarga: (d) => d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear(),
    fechaArchivo: (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
    fechaHora(d) {
      const hoy = new Date();
      const hora = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      if (d.toDateString() === hoy.toDateString()) return 'hoy a las ' + hora;
      return d.getDate() + ' de ' + MESES[d.getMonth()] + ' a las ' + hora;
    },
    /** minúsculas, sin tildes ni espacios repetidos */
    normalizar: (s) =>
      String(s === null || s === undefined ? '' : s)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim(),
    html: (s) =>
      String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
  };
})();
