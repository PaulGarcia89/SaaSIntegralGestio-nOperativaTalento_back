import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type EnterpriseIntegrationCode =
  | 'DOCUSIGN'
  | 'DROPBOX_SIGN'
  | 'HRIS'
  | 'PAYROLL'
  | 'SCIM'
  | 'GOOGLE_WORKSPACE'
  | 'MICROSOFT_365'
  | 'ITSM';

type IntegrationDefinition = {
  code: EnterpriseIntegrationCode;
  name: string;
  category: 'Firma' | 'Personas' | 'Identidad' | 'Operaciones';
  capabilities: string[];
  requiredEnv: string[];
  recommendedEnv?: string[];
};

@Injectable()
export class EnterpriseIntegrationsService {
  private readonly definitions: IntegrationDefinition[] = [
    { code: 'DOCUSIGN', name: 'DocuSign', category: 'Firma', capabilities: ['Envío de sobres', 'Estado mediante webhook', 'Evidencia de firma'], requiredEnv: ['DOCUSIGN_INTEGRATION_KEY', 'DOCUSIGN_ACCOUNT_ID', 'DOCUSIGN_USER_ID', 'DOCUSIGN_PRIVATE_KEY', 'DOCUSIGN_BASE_PATH', 'DOCUSIGN_WEBHOOK_SECRET'] },
    { code: 'DROPBOX_SIGN', name: 'Dropbox Sign', category: 'Firma', capabilities: ['Solicitud de firma', 'Estado mediante webhook', 'Evidencia de firma'], requiredEnv: ['DROPBOX_SIGN_API_KEY', 'DROPBOX_SIGN_CLIENT_ID', 'DROPBOX_SIGN_CLIENT_SECRET', 'DROPBOX_SIGN_WEBHOOK_SECRET'] },
    { code: 'HRIS', name: 'HRIS', category: 'Personas', capabilities: ['Alta de empleado', 'Sincronización de perfil', 'Baja laboral'], requiredEnv: ['HRIS_BASE_URL', 'HRIS_API_KEY'] },
    { code: 'PAYROLL', name: 'Nómina', category: 'Personas', capabilities: ['Alta para nómina', 'Cambios de compensación', 'Baja de nómina'], requiredEnv: ['PAYROLL_BASE_URL', 'PAYROLL_API_KEY'] },
    { code: 'SCIM', name: 'SCIM 2.0', category: 'Identidad', capabilities: ['Aprovisionamiento de cuentas', 'Revocación de accesos', 'Grupos y roles'], requiredEnv: ['SCIM_BASE_URL', 'SCIM_BEARER_TOKEN'] },
    { code: 'GOOGLE_WORKSPACE', name: 'Google Workspace', category: 'Identidad', capabilities: ['Cuenta de trabajo', 'Grupos', 'Revocación de cuenta'], requiredEnv: ['GOOGLE_WORKSPACE_CUSTOMER_ID', 'GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON'], recommendedEnv: ['GOOGLE_WORKSPACE_ADMIN_EMAIL'] },
    { code: 'MICROSOFT_365', name: 'Microsoft 365', category: 'Identidad', capabilities: ['Usuario de Entra ID', 'Licencias y grupos', 'Revocación de cuenta'], requiredEnv: ['MICROSOFT_365_TENANT_ID', 'MICROSOFT_365_CLIENT_ID', 'MICROSOFT_365_CLIENT_SECRET'] },
    { code: 'ITSM', name: 'ITSM', category: 'Operaciones', capabilities: ['Solicitud de equipo', 'Solicitud de acceso', 'Cierre de accesos'], requiredEnv: ['ITSM_BASE_URL', 'ITSM_API_KEY'] },
  ];

  describe() {
    return this.definitions.map((definition) => {
      const missing = definition.requiredEnv.filter((name) => !process.env[name]?.trim());
      return {
        code: definition.code, name: definition.name, category: definition.category, capabilities: definition.capabilities,
        configured: missing.length === 0, missing,
        recommendedConfigured: (definition.recommendedEnv ?? []).every((name) => Boolean(process.env[name]?.trim())),
      };
    });
  }

  isConfigured(code: EnterpriseIntegrationCode) {
    return Boolean(this.describe().find((item) => item.code === code)?.configured);
  }

  assertConfigured(code: EnterpriseIntegrationCode) {
    const integration = this.describe().find((item) => item.code === code);
    if (!integration?.configured) {
      throw new ServiceUnavailableException(`${code} no está configurado. Faltan: ${integration?.missing.join(', ') ?? 'configuración del proveedor'}`);
    }
  }

  accessDestinations(requested: unknown) {
    const values = Array.isArray(requested) ? requested : [];
    const codes = values.filter((value): value is EnterpriseIntegrationCode => typeof value === 'string' && this.definitions.some((item) => item.code === value));
    return [...new Set(codes)].map((code) => ({ code, ready: this.isConfigured(code) }));
  }
}
