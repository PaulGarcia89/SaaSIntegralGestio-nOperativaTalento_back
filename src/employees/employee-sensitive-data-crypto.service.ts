import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

@Injectable()
export class EmployeeSensitiveDataCryptoService {
  encrypt(value: string) {
    const key = this.encryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
  }

  decrypt(value: string) {
    const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  maskSsn(last4?: string | null) {
    return last4 ? `***-**-${last4}` : null;
  }

  private encryptionKey() {
    const secret = process.env.EMPLOYEE_SENSITIVE_DATA_KEY ?? process.env.CALENDAR_OAUTH_STATE_SECRET ?? process.env.JWT_REFRESH_SECRET ?? 'employee-sensitive-dev-key';
    return createHash('sha256').update(secret).digest();
  }
}
