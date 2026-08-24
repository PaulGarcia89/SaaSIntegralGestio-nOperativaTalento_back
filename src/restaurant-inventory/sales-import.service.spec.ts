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
});
