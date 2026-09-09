/**
 * Vista previa de la plantilla de correo, sin base de datos ni envío.
 *
 *   npx ts-node -T scripts/preview-notification-email.ts [carpeta]
 *
 * Escribe dos casos —uno de candidato con vacante y etapa, y uno interno sin
 * postulación— para poder abrirlos en el navegador y en un cliente de correo
 * real antes de tocar nada. Existe porque revisar una plantilla de correo
 * mandándose correos a uno mismo es lento y deja rastro en el histórico de
 * entregas.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderNotificationEmail } from '../src/notifications/notification-email.template';

const destino = process.argv[2] ?? 'tmp';
mkdirSync(destino, { recursive: true });

const candidato = renderNotificationEmail({
  marca: 'DATALINK TECH CORP',
  acento: '#3b5bdb',
  titulo: 'Tu postulación avanzó a Entrevista técnica',
  mensaje:
    'Hola Paul, hemos revisado tu perfil para la vacante de Chef ejecutivo y nos gustaría avanzar contigo.\n\nEl equipo de selección te escribirá en los próximos dos días hábiles para coordinar la entrevista. No necesitas hacer nada por ahora.',
  urlAccion: 'https://saas.lessacorp.com/application-status',
  etiquetaAccion: 'Ver mi postulación',
  filas: [
    { etiqueta: 'Empresa', valor: 'DATALINK TECH CORP' },
    { etiqueta: 'Sucursal', valor: 'KendallDr' },
    { etiqueta: 'Vacante', valor: 'Chef ejecutivo' },
    { etiqueta: 'Etapa', valor: 'Entrevista técnica', distintivo: true },
  ],
  correoSoporte: 'seleccion@datalinktech.com',
  notaPie: 'Recibes este correo porque tienes una postulación activa en este proceso.',
});

const interno = renderNotificationEmail({
  marca: 'Latin American Coral Way',
  acento: '#f59e0b',
  titulo: 'Tienes 3 documentos por vencer esta semana',
  mensaje:
    'Tres expedientes de tu sucursal tienen documentos que vencen antes del viernes. Revísalos para que nadie quede sin cobertura.',
  urlAccion: 'https://saas.lessacorp.com/people/documents',
  etiquetaAccion: 'Abrir en la plataforma',
  filas: [
    { etiqueta: 'Empresa', valor: 'Latin American Coral Way Restaurant' },
    { etiqueta: 'Sucursal', valor: 'Sucursal Coral Way — Salón principal' },
  ],
  notaPie:
    'Mensaje automático del espacio de trabajo. Puedes ajustar qué avisos recibes desde tus preferencias de notificación.',
});

writeFileSync(join(destino, 'correo-candidato.html'), candidato.html);
writeFileSync(join(destino, 'correo-candidato.txt'), candidato.text);
writeFileSync(join(destino, 'correo-interno.html'), interno.html);
writeFileSync(join(destino, 'correo-interno.txt'), interno.text);
console.log(`Vista previa escrita en ${destino}/`);
