import { Injectable } from '@nestjs/common';
import { EnterpriseIntegrationsService } from '../enterprise-integrations/enterprise-integrations.service';

@Injectable()
export class SignatureProviderService {
  constructor(private readonly integrations: EnterpriseIntegrationsService) {}

  assertAvailable(provider: string) {
    if (provider === 'INTERNAL') return;
    if (provider === 'DOCUSIGN' || provider === 'DROPBOX_SIGN') {
      this.integrations.assertConfigured(provider);
      return;
    }
    throw new Error(`Proveedor de firma no reconocido: ${provider}`);
  }

  describe() {
    return [
      { code: 'INTERNAL', name: 'Consentimiento electrónico TalentOS', configured: true, evidence: ['token de un solo uso', 'timestamp', 'huella de red', 'huella de dispositivo', 'checksum del documento'] },
      ...this.integrations.describe()
        .filter((integration) => integration.code === 'DOCUSIGN' || integration.code === 'DROPBOX_SIGN')
        .map((integration) => ({
          code: integration.code,
          name: integration.name,
          // A credential is not enough: external providers stay disabled until their
          // envelope adapter and signed webhook are verified in the target account.
          configured: false,
          credentialsConfigured: integration.configured,
          reason: integration.configured
            ? 'Credenciales detectadas; falta certificar el adaptador y el webhook antes de enviar sobres reales'
            : `Faltan: ${integration.missing.join(', ')}`,
        })),
    ];
  }
}
