import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = (__ENV.ATS_LOAD_BASE_URL || '').replace(/\/$/, '');
if (!baseUrl) throw new Error('Define ATS_LOAD_BASE_URL con el dominio Railway autorizado.');
if (!baseUrl.startsWith('https://') && __ENV.ATS_LOAD_ALLOW_HTTP !== 'true') throw new Error('La prueba de Railway exige HTTPS.');

export const options = {
  scenarios: {
    read_only_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: Number(__ENV.ATS_LOAD_VUS || 10) },
        { duration: '60s', target: Number(__ENV.ATS_LOAD_VUS || 10) },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: [`p(95)<${Number(__ENV.ATS_LOAD_MAX_P95_MS || 1500)}`],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const health = http.get(`${baseUrl}/api/health/live`, { tags: { endpoint: 'health' } });
  check(health, { 'salud disponible': (response) => response.status === 200 });

  const vacancies = http.get(`${baseUrl}/api/public/vacancies?page=1&pageSize=10`, { tags: { endpoint: 'public-vacancies' } });
  check(vacancies, {
    'vacantes públicas responden': (response) => response.status === 200,
    'respuesta paginada': (response) => Array.isArray(response.json('data')),
    'sin datos sensibles': (response) => !response.body.includes('accessToken'),
  });
  sleep(Number(__ENV.ATS_LOAD_SLEEP_SECONDS || 1));
}
