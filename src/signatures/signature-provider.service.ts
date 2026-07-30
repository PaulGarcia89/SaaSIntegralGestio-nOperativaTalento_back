import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class SignatureProviderService {
  assertAvailable(provider: string) {
    if (provider === 'INTERNAL') return;
    throw new ServiceUnavailableException(`${provider} adapter is not enabled`);
  }

  describe() {
    return [
      { code: 'INTERNAL', name: 'Consentimiento electrónico TalentOS', configured: true, evidence: ['token de un solo uso', 'timestamp', 'huella de red', 'huella de dispositivo', 'checksum del documento'] },
      { code: 'DOCUSIGN', name: 'DocuSign', configured: false, reason: 'Adaptador pendiente de credenciales, OAuth y webhooks' },
      { code: 'DROPBOX_SIGN', name: 'Dropbox Sign', configured: false, reason: 'Adaptador pendiente de credenciales y webhooks' },
    ];
  }
}
