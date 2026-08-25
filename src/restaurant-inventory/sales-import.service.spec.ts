import AdmZip from 'adm-zip';
import { SalesImportService } from './sales-import.service';

describe('SalesImportService parser security', () => {
  const service = new SalesImportService({} as never, {} as never);

  it('parses CSV rows without touching inventory', () => {
    const rows = (service as any).parse(Buffer.from('sale_id,product_code,quantity,sold_at\nS1,P1,2,2026-08-23T12:00:00Z\n'), 'ventas.csv');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(['S1', 'P1', '2', '2026-08-23T12:00:00Z']);
  });

  it('rejects Excel formulas before reading values', () => {
    const zip = new AdmZip();
    zip.addFile('xl/workbook.xml', Buffer.from('<workbook><sheets><sheet r:id="rId1"/></sheets></workbook>'));
    zip.addFile('xl/_rels/workbook.xml.rels', Buffer.from('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'));
    zip.addFile('xl/worksheets/sheet1.xml', Buffer.from('<worksheet><row><c><f>1+1</f><v>2</v></c></row></worksheet>'));
    expect(() => (service as any).parse(zip.toBuffer(), 'ventas.xlsx')).toThrow('fórmulas');
  });

  it('parses a large CSV without changing inventory', () => {
    const lines = ['external_sale_id,external_product_code,quantity,sold_at'];
    for (let index = 0; index < 10000; index += 1) {
      lines.push(`SALE-${index},SKU-001,1,2026-08-23T12:00:00Z`);
    }

    const rows = (service as any).parse(Buffer.from(lines.join('\n')), 'ventas.csv');

    expect(rows).toHaveLength(10001);
    expect(rows[10000][0]).toBe('SALE-9999');
  });

  it('does not claim an import already claimed by another worker', async () => {
    const prisma = {
      restaurantSalesImport: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue({ id: 'import-1', tenantId: 'tenant-1', status: 'PROCESSING', totalRows: 2, validRows: 2, invalidRows: 0, duplicateRows: 0, processedRows: 0, failedRows: 0, cancelRequested: false, rows: [] }),
      },
    };
    const guarded = new SalesImportService(prisma as never, {} as never);

    const result = await guarded.process('tenant-1', 'user-1', 'import-1');

    expect(prisma.restaurantSalesImport.updateMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({ queued: true, status: 'PROCESSING', percent: 0 }));
  });
});
