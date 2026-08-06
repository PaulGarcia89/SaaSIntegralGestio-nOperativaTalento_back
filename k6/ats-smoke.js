import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = { vus: 5, duration: '30s', thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<800'] } };
const baseUrl = __ENV.BASE_URL;

export default function () {
  if (!baseUrl) throw new Error('Define BASE_URL con un entorno de pruebas autorizado.');
  const response = http.get(`${baseUrl}/api/health`);
  check(response, { 'respuesta disponible': (item) => item.status >= 200 && item.status < 400 });
  sleep(1);
}
