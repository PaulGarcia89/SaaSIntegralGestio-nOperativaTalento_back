import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RestaurantReportQueryDto } from './restaurant-inventory.dto';

describe('Restaurant report HTTP query pagination', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  const parse = (query: Record<string, unknown>) => pipe.transform(query, { type: 'query', metatype: RestaurantReportQueryDto });

  it('converts URL pagination values into numbers', async () => {
    await expect(parse({ page: '1', pageSize: '50' })).resolves.toMatchObject({ page: 1, pageSize: 50 });
  });

  it('allows omitted pagination for service defaults', async () => {
    await expect(parse({})).resolves.toBeInstanceOf(RestaurantReportQueryDto);
  });

  it.each([
    { page: '0' }, { page: '-1' }, { page: '1.5' }, { page: 'abc' },
    { pageSize: '0' }, { pageSize: '-1' }, { pageSize: '1.5' },
    { pageSize: 'abc' }, { pageSize: '201' },
  ])('rejects invalid pagination %j', async (query) => {
    await expect(parse(query)).rejects.toBeInstanceOf(BadRequestException);
  });
});
