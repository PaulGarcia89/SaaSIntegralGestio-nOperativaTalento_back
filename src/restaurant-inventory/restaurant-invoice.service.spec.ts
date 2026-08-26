import { BasicInvoiceOcrProvider } from './restaurant-invoice.service';

describe('Invoice OCR provider boundary', () => {
  it('keeps the OCR provider decoupled and requires manual review when confidence is absent', async () => {
    await expect(new BasicInvoiceOcrProvider().process(Buffer.from('document'))).resolves.toMatchObject({ confidence: 0, lines: [] });
  });
});
