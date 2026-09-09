/**
 * Plantilla de los correos de notificación.
 *
 * Antes no había ninguna: `communication-delivery.service.ts` enviaba
 * `text: notification.message` y nada más. Un candidato recibía un párrafo
 * suelto, sin remitente reconocible, sin saber de qué empresa venía, a qué
 * vacante correspondía ni en qué punto del proceso estaba. Ese correo es, para
 * mucha gente, el ÚNICO contacto con el producto.
 *
 * Decisiones de fondo
 * -------------------
 * 1. **Tablas y estilos en línea.** No es nostalgia: Outlook en Windows compone
 *    con el motor de Word, que ignora `flex`, `grid`, `float` y casi toda hoja
 *    de estilos externa o incrustada. Una maqueta moderna se desarma justo en
 *    el cliente corporativo donde más se leen estos correos.
 * 2. **Todo valor interpolado se escapa.** El nombre de una empresa, de una
 *    vacante o de una sucursal los escribe un usuario; sin escapar, un `<` en
 *    cualquiera de ellos rompe el correo, y una etiqueta completa lo convierte
 *    en un vector de inyección.
 * 3. **El texto plano se conserva y se enriquece.** El correo sale como
 *    `multipart/alternative`: quien filtre el HTML sigue recibiendo el mensaje
 *    íntegro Y el contexto, en vez de un HTML vacío.
 * 4. **El color de marca solo decora.** El botón va siempre en tinta oscura
 *    sobre blanco porque el color del inquilino es arbitrario: un amarillo de
 *    marca con texto blanco encima no llega ni de lejos a AA. La marca se nota
 *    en el filo superior, en el cuadro de iniciales y en el distintivo de
 *    etapa, donde el contraste se calcula, no se supone.
 */

export type FilaContexto = {
  etiqueta: string;
  valor: string;
  /** La etapa del proceso se dibuja como distintivo, no como texto corrido. */
  distintivo?: boolean;
};

export type DatosCorreo = {
  marca: string;
  titulo: string;
  mensaje: string;
  acento?: string | null;
  logoUrl?: string | null;
  urlAccion?: string | null;
  etiquetaAccion?: string | null;
  filas?: FilaContexto[];
  correoSoporte?: string | null;
  notaPie?: string | null;
};

const TINTA = '#101b2d';
const TINTA_SUAVE = '#5b6577';
const LINEA = '#e3e6ec';
const FONDO = '#f2f4f7';
const ACENTO_POR_DEFECTO = '#1f3a5f';

const TIPOGRAFIA =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

export function escaparHtml(valor: string) {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** `#abc` y `#aabbcc`; cualquier otra cosa se descarta en vez de escribirse tal cual. */
export function normalizarHex(color: string | null | undefined) {
  if (!color) return null;
  const limpio = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(limpio)) return limpio;
  if (/^#[0-9a-f]{3}$/.test(limpio)) return `#${limpio[1]}${limpio[1]}${limpio[2]}${limpio[2]}${limpio[3]}${limpio[3]}`;
  return null;
}

function canales(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function aHex(canal: number) {
  return Math.max(0, Math.min(255, Math.round(canal))).toString(16).padStart(2, '0');
}

/** Mezcla en sRGB, que es como componen los clientes de correo. */
export function mezclar(hexA: string, hexB: string, peso: number) {
  const a = canales(hexA);
  const b = canales(hexB);
  return `#${a.map((canal, i) => aHex(canal * peso + b[i] * (1 - peso))).join('')}`;
}

function luminancia(hex: string) {
  const lineal = canales(hex).map((canal) => {
    const c = canal / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lineal[0] + 0.7152 * lineal[1] + 0.0722 * lineal[2];
}

/**
 * Tinta legible sobre un fondo cualquiera.
 *
 * El color de marca lo elige cada empresa y puede ser un amarillo claro o un
 * azul casi negro. Elegir siempre blanco dejaría las iniciales invisibles en la
 * mitad de los casos.
 */
export function tintaSobre(fondo: string) {
  return luminancia(fondo) > 0.42 ? TINTA : '#ffffff';
}

/**
 * Solo `http(s)`. Un `actionUrl` con `javascript:` o `data:` convertiría el
 * botón principal del correo en un enlace hostil.
 */
export function urlSegura(url: string | null | undefined) {
  if (!url) return null;
  try {
    const analizada = new URL(url);
    return analizada.protocol === 'http:' || analizada.protocol === 'https:' ? analizada.toString() : null;
  } catch {
    return null;
  }
}

function parrafos(mensaje: string) {
  return mensaje
    .split(/\n{2,}/)
    .map((bloque) => bloque.trim())
    .filter(Boolean);
}

function filaContexto(fila: FilaContexto, acento: string, ultima: boolean) {
  const etiqueta = escaparHtml(fila.etiqueta);
  const valor = escaparHtml(fila.valor);
  // La última fila no lleva filo: si no, queda una raya suelta a un dedo
  // del borde de la tarjeta, que es el detalle que delata una plantilla
  // montada a ojo.
  const filo = ultima ? 'none' : `1px solid ${LINEA}`;
  const contenido = fila.distintivo
    ? `<span style="display:inline-block;padding:5px 11px;border-radius:999px;background:${mezclar(acento, '#ffffff', 0.14)};border:1px solid ${mezclar(acento, '#ffffff', 0.35)};color:${TINTA};font-size:13px;font-weight:700;line-height:1.2;">${valor}</span>`
    : `<span style="color:${TINTA};font-size:15px;font-weight:600;line-height:1.45;">${valor}</span>`;

  return `<tr>
      <td class="ctx-l" style="padding:11px 0;border-bottom:${filo};font-family:${TIPOGRAFIA};color:${TINTA_SUAVE};font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;vertical-align:top;">${etiqueta}</td>
      <td class="ctx-v" style="padding:11px 0 11px 16px;border-bottom:${filo};font-family:${TIPOGRAFIA};text-align:right;vertical-align:top;">${contenido}</td>
    </tr>`;
}

export function renderNotificationEmail(datos: DatosCorreo): { html: string; text: string } {
  const acento = normalizarHex(datos.acento) ?? ACENTO_POR_DEFECTO;
  const marca = escaparHtml(datos.marca);
  const titulo = escaparHtml(datos.titulo);
  const filas = (datos.filas ?? []).filter((fila) => fila.valor.trim().length > 0);
  const accion = urlSegura(datos.urlAccion);
  const logo = urlSegura(datos.logoUrl);
  const soporte = datos.correoSoporte?.trim() || null;

  // Línea de vista previa: lo que la bandeja enseña junto al asunto. Sin ella,
  // los clientes rellenan ese hueco con el primer texto que encuentren, que
  // suele ser «Ver en la plataforma» o el propio nombre de la empresa.
  const preencabezado = escaparHtml(datos.mensaje.replace(/\s+/g, ' ').trim().slice(0, 140));

  const cabeceraMarca = logo
    ? `<img src="${escaparHtml(logo)}" alt="${marca}" width="128" style="display:block;max-width:128px;max-height:36px;width:auto;height:auto;border:0;" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="40" height="40" align="center" valign="middle" style="width:40px;height:40px;border-radius:10px;background:${acento};font-family:${TIPOGRAFIA};color:${tintaSobre(acento)};font-size:18px;font-weight:700;">${marca.charAt(0).toUpperCase()}</td>
          <td style="padding-left:12px;font-family:${TIPOGRAFIA};color:${TINTA};font-size:16px;font-weight:700;letter-spacing:-0.01em;">${marca}</td>
        </tr></table>`;

  const cuerpo = parrafos(datos.mensaje)
    .map(
      (parrafo) =>
        `<p style="margin:0 0 14px;font-family:${TIPOGRAFIA};color:${TINTA_SUAVE};font-size:15px;line-height:1.65;">${escaparHtml(parrafo).replace(/\n/g, '<br />')}</p>`,
    )
    .join('');

  const bloqueContexto = filas.length
    ? `<tr><td class="pad" style="padding:4px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#fbfcfd;border:1px solid ${LINEA};border-radius:12px;">
            <tr><td style="padding:4px 18px 6px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                ${filas.map((fila, i) => filaContexto(fila, acento, i === filas.length - 1)).join('')}
              </table>
            </td></tr>
          </table>
        </td></tr>`
    : '';

  const bloqueAccion = accion
    ? `<tr><td class="pad" style="padding:26px 32px 4px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="center" style="border-radius:10px;background:${TINTA};">
              <a href="${escaparHtml(accion)}" style="display:inline-block;padding:14px 26px;font-family:${TIPOGRAFIA};color:#ffffff;font-size:15px;font-weight:600;line-height:1;text-decoration:none;border-radius:10px;">${escaparHtml(datos.etiquetaAccion?.trim() || 'Ver el detalle')}</a>
            </td>
          </tr></table>
        </td></tr>`
    : '';

  const pie = [
    datos.notaPie?.trim() ? escaparHtml(datos.notaPie.trim()) : null,
    soporte ? `¿Dudas? Escribe a <a href="mailto:${escaparHtml(soporte)}" style="color:${TINTA};text-decoration:underline;">${escaparHtml(soporte)}</a>.` : null,
  ].filter(Boolean);

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="es">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${titulo}</title>
<style type="text/css">
/*
  Único bloque de estilos, y solo para pantallas estrechas. Outlook de
  escritorio lo ignora, que es justamente lo que se busca: allí la ventana
  siempre es ancha y la maqueta fija de 600px es la correcta. En el móvil, en
  cambio, rótulo y valor en la misma fila no caben —el ancho mínimo de la tabla
  superaba los 375px del iPhone y el correo se desplazaba en horizontal—, así
  que se apilan.
*/
@media only screen and (max-width:620px) {
  .marco { width:100% !important; }
  .pad { padding-left:20px !important; padding-right:20px !important; }
  .ctx-l { display:block !important; width:100% !important; padding:12px 0 3px !important; border-bottom:0 !important; }
  .ctx-v { display:block !important; width:100% !important; padding:0 0 12px !important; text-align:left !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:${FONDO};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preencabezado}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${FONDO};">
  <tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" class="marco" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;border:1px solid ${LINEA};overflow:hidden;">
      <tr><td style="height:4px;background:${acento};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td class="pad" style="padding:26px 32px 20px;border-bottom:1px solid ${LINEA};">${cabeceraMarca}</td></tr>
      <tr><td class="pad" style="padding:26px 32px 6px;">
        <h1 style="margin:0 0 14px;font-family:${TIPOGRAFIA};color:${TINTA};font-size:21px;font-weight:700;line-height:1.3;letter-spacing:-0.01em;">${titulo}</h1>
        ${cuerpo}
      </td></tr>
      ${bloqueContexto}
      ${bloqueAccion}
      <tr><td class="pad" style="padding:26px 32px 28px;">
        <div style="height:1px;background:${LINEA};font-size:0;line-height:0;">&nbsp;</div>
        <p style="margin:16px 0 0;font-family:${TIPOGRAFIA};color:${TINTA_SUAVE};font-size:12px;line-height:1.6;">
          ${pie.length ? pie.join('<br />') : `Mensaje autom&aacute;tico de ${marca}.`}
        </p>
      </td></tr>
    </table>
    <p style="margin:16px 0 0;font-family:${TIPOGRAFIA};color:#8b95a6;font-size:11px;line-height:1.5;">${marca}</p>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    datos.mensaje.trim(),
    filas.length ? filas.map((fila) => `${fila.etiqueta}: ${fila.valor}`).join('\n') : null,
    accion ? `${datos.etiquetaAccion?.trim() || 'Ver el detalle'}: ${accion}` : null,
    pie.length ? datos.notaPie?.trim() || null : null,
    soporte ? `Soporte: ${soporte}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { html, text };
}
