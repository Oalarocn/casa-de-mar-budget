/* Dibuja una escena de CDM.escena en SVG (vista previa) o en PDF (pdf-lib).
   Las medidas de texto salen de las mismas fuentes (fontkit) que usa pdf-lib, y el SVG desactiva el
   interletraje para que ambos coincidan. */
(function () {
  'use strict';
  const CDM = (window.CDM = window.CDM || {});
  const F = CDM.formato;

  const FAMILIA = { writer: "'CDM Writer'", mori: "'CDM Mori'" };
  const n = (v) => (Math.round(v * 100) / 100).toString();
  const n4 = (v) => (Math.round(v * 10000) / 10000).toString();

  /** Anchos de texto con las métricas reales de las fuentes (igual que pdf-lib). */
  class Metricas {
    constructor(fuentes) {
      this.fuentes = fuentes; // { writer: fontkitFont, mori: fontkitFont }
      this.cache = new Map();
    }
    ancho(fuente, texto, tam) {
      const clave = fuente + '\u0000' + texto;
      let w = this.cache.get(clave);
      if (w === undefined) {
        const f = this.fuentes[fuente];
        const run = f.layout(texto);
        w = 0;
        for (const g of run.glyphs) w += g.advanceWidth;
        w /= f.unitsPerEm;
        this.cache.set(clave, w);
      }
      return w * tam;
    }
  }

  function svg(escena, opciones) {
    const o = [];
    o.push(
      `<svg xmlns="http://www.w3.org/2000/svg" class="ficha" viewBox="0 0 ${escena.ancho} ${escena.alto}" role="img" aria-label="${F.html(opciones.etiqueta || '')}">`,
    );
    o.push(`<rect width="${escena.ancho}" height="${escena.alto}" fill="#FFFFFF"/>`);
    for (const it of escena.items) {
      if (it.t === 'img') {
        o.push(`<image href="${opciones.fotos[it.torre]}" x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}" preserveAspectRatio="none"/>`);
      } else if (it.t === 'path') {
        const a = [`d="${it.d}"`, `transform="translate(${n(it.tx)} ${n(it.ty)}) scale(${n4(it.s)})"`, `fill="${it.fill || 'none'}"`];
        if (it.fillOpacity !== undefined && it.fillOpacity !== 1) a.push(`fill-opacity="${it.fillOpacity}"`);
        if (it.stroke) {
          a.push(`stroke="${it.stroke}" stroke-width="${it.strokeWidth}" stroke-linejoin="miter"`);
          if (it.strokeOpacity !== undefined && it.strokeOpacity !== 1) a.push(`stroke-opacity="${it.strokeOpacity}"`);
        }
        if (it.unidad) a.push(`class="unidad${it.disponible ? ' disp' : ''}" data-unidad="${it.unidad}"`);
        o.push(`<path ${a.join(' ')}/>`);
      } else if (it.t === 'text') {
        const ancla = it.anchor && it.anchor !== 'start' ? ` text-anchor="${it.anchor}"` : '';
        o.push(`<text x="${n(it.x)}" y="${n(it.y)}" font-family="${FAMILIA[it.font]}" font-size="${n4(it.size)}" fill="${it.color}"${ancla}>${F.html(it.text)}</text>`);
      } else if (it.t === 'line') {
        const dash = it.dash ? ` stroke-dasharray="${it.dash.map(n4).join(' ')}"` : '';
        o.push(`<line x1="${n(it.x1)}" y1="${n4(it.y1)}" x2="${n(it.x2)}" y2="${n4(it.y2)}" stroke="${it.color}" stroke-width="${n4(it.w)}"${dash}/>`);
      } else if (it.t === 'rect') {
        o.push(`<rect x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}" fill="${it.fill}"/>`);
      }
    }
    o.push('</svg>');
    return o.join('');
  }

  function color(L, hex) {
    const v = parseInt(hex.slice(1), 16);
    return L.rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
  }

  /**
   * @param {{torres: string[], escena: (t:string)=>object, fuentes: {writer: ArrayBuffer, mori: ArrayBuffer},
   *          fotoHD: (t:string)=>Promise<ArrayBuffer>, titulo: string}} p
   * @returns {Promise<Uint8Array>}
   */
  async function generarPDF(p) {
    const L = window.PDFLib;
    const doc = await L.PDFDocument.create();
    doc.registerFontkit(window.fontkit);
    const fuentes = {
      writer: await doc.embedFont(p.fuentes.writer, { subset: true }),
      mori: await doc.embedFont(p.fuentes.mori, { subset: true }),
    };
    for (const torreId of p.torres) {
      const esc = p.escena(torreId);
      const H = esc.alto;
      const pagina = doc.addPage([esc.ancho, esc.alto]);
      for (const it of esc.items) {
        if (it.t === 'img') {
          const img = await doc.embedJpg(await p.fotoHD(it.torre));
          pagina.drawImage(img, { x: it.x, y: H - it.y - it.h, width: it.w, height: it.h });
        } else if (it.t === 'path') {
          const op = { x: it.tx, y: H - it.ty, scale: it.s };
          if (it.fill) {
            op.color = color(L, it.fill);
            op.opacity = it.fillOpacity === undefined ? 1 : it.fillOpacity;
          }
          if (it.stroke) {
            op.borderColor = color(L, it.stroke);
            op.borderWidth = it.strokeWidth;
            op.borderOpacity = it.strokeOpacity === undefined ? 1 : it.strokeOpacity;
          }
          pagina.drawSvgPath(it.d, op);
        } else if (it.t === 'text') {
          const fuente = fuentes[it.font];
          let x = it.x;
          if (it.anchor === 'middle' || it.anchor === 'end') {
            const w = fuente.widthOfTextAtSize(it.text, it.size);
            x -= it.anchor === 'middle' ? w / 2 : w;
          }
          pagina.drawText(it.text, { x, y: H - it.y, size: it.size, font: fuente, color: color(L, it.color) });
        } else if (it.t === 'line') {
          const op = { start: { x: it.x1, y: H - it.y1 }, end: { x: it.x2, y: H - it.y2 }, thickness: it.w, color: color(L, it.color) };
          if (it.dash) op.dashArray = it.dash;
          pagina.drawLine(op);
        } else if (it.t === 'rect') {
          pagina.drawRectangle({ x: it.x, y: H - it.y - it.h, width: it.w, height: it.h, color: color(L, it.fill) });
        }
      }
    }
    doc.setTitle(p.titulo);
    doc.setAuthor('Casa de Mar · Residence Sunzal');
    doc.setSubject('Disponibilidad de apartamentos');
    doc.setCreator('Disponibilidad Casa de Mar');
    doc.setProducer('Disponibilidad Casa de Mar (pdf-lib)');
    doc.setCreationDate(new Date());
    doc.setModificationDate(new Date());
    if (typeof doc.setLanguage === 'function') doc.setLanguage('es');
    return doc.save();
  }

  CDM.Metricas = Metricas;
  CDM.render = { svg, pdf: generarPDF };
})();
