import {
  escaparHtml,
  mezclar,
  normalizarHex,
  renderNotificationEmail,
  tintaSobre,
  urlSegura,
} from './notification-email.template';

const base = {
  marca: 'DATALINK TECH CORP',
  titulo: 'Tu postulación avanzó de etapa',
  mensaje: 'Hemos revisado tu perfil y pasas a la siguiente etapa.\n\nTe contactaremos para coordinar la entrevista.',
};

describe('plantilla de correo de notificación', () => {
  it('escapa el HTML de cada valor interpolado', () => {
    const { html } = renderNotificationEmail({
      ...base,
      marca: 'Ácme <script>alert(1)</script>',
      filas: [{ etiqueta: 'Vacante', valor: 'Chef "principal" & pastelería <b>' }],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Chef &quot;principal&quot; &amp; pasteler&iacute;a'.replace('&iacute;', 'í'));
  });

  it('omite las filas sin dato en lugar de dibujar rótulos vacíos', () => {
    const { html, text } = renderNotificationEmail({
      ...base,
      filas: [
        { etiqueta: 'Empresa', valor: 'Datalink' },
        { etiqueta: 'Sucursal', valor: '   ' },
        { etiqueta: 'Vacante', valor: '' },
      ],
    });
    expect(html).toContain('Empresa');
    expect(html).not.toContain('Sucursal');
    expect(html).not.toContain('Vacante');
    expect(text).toContain('Empresa: Datalink');
    expect(text).not.toContain('Sucursal');
  });

  it('no dibuja el botón cuando no hay enlace, y rechaza esquemas hostiles', () => {
    expect(renderNotificationEmail(base).html).not.toContain('<a href');
    const hostil = renderNotificationEmail({ ...base, urlAccion: 'javascript:alert(1)' });
    expect(hostil.html).not.toContain('javascript:');
    expect(hostil.html).not.toContain('<a href');
    expect(renderNotificationEmail({ ...base, urlAccion: 'https://app.example.com/x' }).html)
      .toContain('https://app.example.com/x');
  });

  it('conserva el mensaje íntegro en la versión de texto', () => {
    const { text } = renderNotificationEmail({ ...base, filas: [{ etiqueta: 'Etapa', valor: 'Entrevista' }] });
    expect(text).toContain('Hemos revisado tu perfil');
    expect(text).toContain('Te contactaremos para coordinar la entrevista.');
    expect(text).toContain('Etapa: Entrevista');
  });

  it('descarta un color de marca que no sea hexadecimal en vez de escribirlo tal cual', () => {
    expect(normalizarHex('rgb(1,2,3)')).toBeNull();
    expect(normalizarHex('#ABC')).toBe('#aabbcc');
    expect(normalizarHex(null)).toBeNull();
    const { html } = renderNotificationEmail({ ...base, acento: 'red; background:url(x)' });
    expect(html).not.toContain('url(x)');
  });

  it('elige tinta legible sobre el color de marca, sea claro u oscuro', () => {
    expect(tintaSobre('#fde047')).toBe('#101b2d');
    expect(tintaSobre('#1f3a5f')).toBe('#ffffff');
  });

  it('mezcla en sRGB para el fondo del distintivo de etapa', () => {
    expect(mezclar('#000000', '#ffffff', 0)).toBe('#ffffff');
    expect(mezclar('#000000', '#ffffff', 1)).toBe('#000000');
    expect(mezclar('#ffffff', '#000000', 0.5)).toBe('#808080');
  });

  it('dibuja la etapa como distintivo y el resto como texto', () => {
    const { html } = renderNotificationEmail({
      ...base,
      filas: [
        { etiqueta: 'Vacante', valor: 'Chef ejecutivo' },
        { etiqueta: 'Etapa', valor: 'Entrevista técnica', distintivo: true },
      ],
    });
    expect(html).toContain('border-radius:999px');
    expect(html.indexOf('Chef ejecutivo')).toBeLessThan(html.indexOf('Entrevista t'));
  });

  it('no usa maquetación que Outlook no compone', () => {
    const { html } = renderNotificationEmail({ ...base, filas: [{ etiqueta: 'Empresa', valor: 'Datalink' }] });
    expect(html).not.toMatch(/display\s*:\s*(flex|grid)/);
    expect(html).not.toMatch(/<link[^>]+stylesheet/);
    expect(html).toContain('role="presentation"');
  });

  it('escapa comillas para que un valor no pueda salirse de un atributo', () => {
    expect(escaparHtml('a"b\'c')).toBe('a&quot;b&#39;c');
    expect(urlSegura('data:text/html,x')).toBeNull();
  });
});
