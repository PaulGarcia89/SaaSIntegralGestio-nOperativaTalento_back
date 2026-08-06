import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import nodemailer from "nodemailer";
import { InterviewCalendarService } from "../recruitment/interview-calendar.service";

export type CertificationStatus = "PASS" | "WARN" | "FAIL" | "SKIPPED";

export interface IntegrationCertificationCheck {
  key: string;
  label: string;
  status: CertificationStatus;
  configured: boolean;
  activeProbe: boolean;
  summary: string;
  durationMs: number;
  evidence: Record<string, unknown>;
  error?: string;
}

export interface ProductionIntegrationCertificationReport {
  status: Exclude<CertificationStatus, "SKIPPED">;
  mode: "CONFIGURATION" | "ACTIVE";
  environment: string;
  generatedAt: string;
  durationMs: number;
  summary: { passed: number; warnings: number; failed: number; skipped: number };
  checks: IntegrationCertificationCheck[];
}

type StorageProfile = {
  key: string;
  label: string;
  driverEnv: string;
  bucketEnv: string;
  regionEnv: string;
  endpointEnv: string;
  forcePathStyleEnv: string;
  accessKeyEnv: string;
  secretKeyEnv: string;
  sseEnv: string;
  defaultDriver: string;
};

@Injectable()
export class ProductionIntegrationCertificationService {
  constructor(private readonly calendars: InterviewCalendarService) {}

  inspect(tenantId?: string) {
    return this.certify({ active: false, tenantId });
  }

  async certify(options: { active: boolean; tenantId?: string }) {
    const startedAt = Date.now();
    const storageProfiles = this.storageProfiles();
    const checks = options.active
      ? await Promise.all([
          this.certifyEmail(true),
          ...storageProfiles.map((profile) => this.certifyStorage(profile, true)),
          this.certifyClamAv(true),
          this.certifyCalendars(true, options.tenantId),
        ])
      : [
          await this.certifyEmail(false),
          ...await Promise.all(storageProfiles.map((profile) => this.certifyStorage(profile, false))),
          await this.certifyClamAv(false),
          await this.certifyCalendars(false, options.tenantId),
        ];
    const summary = {
      passed: checks.filter((check) => check.status === "PASS").length,
      warnings: checks.filter((check) => check.status === "WARN").length,
      failed: checks.filter((check) => check.status === "FAIL").length,
      skipped: checks.filter((check) => check.status === "SKIPPED").length,
    };
    return {
      status: summary.failed ? "FAIL" : summary.warnings || summary.skipped ? "WARN" : "PASS",
      mode: options.active ? "ACTIVE" : "CONFIGURATION",
      environment: process.env.NODE_ENV ?? "development",
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      summary,
      checks,
    } satisfies ProductionIntegrationCertificationReport;
  }

  private async certifyEmail(activeProbe: boolean): Promise<IntegrationCertificationCheck> {
    const provider = process.env.EMAIL_PROVIDER?.trim().toUpperCase()
      || (process.env.SMTP_HOST?.trim() ? "SMTP" : "RESEND");
    return provider === "SMTP"
      ? this.certifySmtp(activeProbe)
      : this.certifyResend(activeProbe);
  }

  private async certifySmtp(activeProbe: boolean): Promise<IntegrationCertificationCheck> {
    const startedAt = Date.now();
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASSWORD;
    const port = Number(process.env.SMTP_PORT?.trim() || "465");
    const secure = process.env.SMTP_SECURE?.trim().toLowerCase() !== "false";
    const senderDomain = this.senderDomain(process.env.NOTIFICATION_FROM_EMAIL?.trim());
    const configured = Boolean(host && user && password && senderDomain && Number.isInteger(port));
    const evidence = { provider: "SMTP", host: host ?? null, port, secure, userConfigured: Boolean(user), senderDomain };
    if (!configured || !activeProbe) {
      return this.configurationCheck(
        "email",
        "Correo SMTP",
        configured,
        activeProbe,
        evidence,
        "Servidor SMTP, credenciales y remitente configurados",
      );
    }
    try {
      const transport = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass: password },
        connectionTimeout: 12_000,
        greetingTimeout: 12_000,
        socketTimeout: 20_000,
      });
      await transport.verify();
      return {
        key: "email",
        label: "Correo SMTP",
        status: "PASS",
        configured: true,
        activeProbe: true,
        summary: "Conexión y autenticación SMTP verificadas",
        durationMs: Date.now() - startedAt,
        evidence: { ...evidence, authenticated: true },
      };
    } catch (error) {
      return this.failedCheck("email", "Correo SMTP", true, true, startedAt, evidence, error);
    }
  }

  private async certifyResend(activeProbe: boolean): Promise<IntegrationCertificationCheck> {
    const startedAt = Date.now();
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
    const sender = process.env.NOTIFICATION_FROM_EMAIL?.trim();
    const senderDomain = this.senderDomain(sender);
    const configured = Boolean(apiKey && webhookSecret && senderDomain);
    const baseEvidence = {
      apiKeyConfigured: Boolean(apiKey),
      webhookSignatureConfigured: Boolean(webhookSecret),
      senderDomain,
    };
    if (!configured || !activeProbe) {
      return this.configurationCheck(
        "resend",
        "Correo Resend",
        configured,
        activeProbe,
        baseEvidence,
        "API, remitente y firma webhook configurados",
      );
    }
    try {
      const response = await this.fetchWithTimeout("https://api.resend.com/domains", {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) throw new Error(`Resend respondió HTTP ${response.status}`);
      const payload = await response.json() as { data?: Array<{ name?: string; status?: string }> };
      const domain = payload.data?.find((item) => item.name?.toLowerCase() === senderDomain);
      const verified = domain?.status?.toLowerCase() === "verified";
      return {
        key: "resend",
        label: "Correo Resend",
        status: verified ? "PASS" : "FAIL",
        configured: true,
        activeProbe: true,
        summary: verified ? "API y dominio remitente verificados" : "El dominio remitente no está verificado",
        durationMs: Date.now() - startedAt,
        evidence: { ...baseEvidence, domainStatus: domain?.status ?? "NOT_FOUND", apiAuthenticated: true },
      };
    } catch (error) {
      return this.failedCheck("resend", "Correo Resend", true, true, startedAt, baseEvidence, error);
    }
  }

  private async certifyStorage(profile: StorageProfile, activeProbe: boolean): Promise<IntegrationCertificationCheck> {
    const startedAt = Date.now();
    const driver = (process.env[profile.driverEnv] ?? profile.defaultDriver).toLowerCase();
    const bucket = process.env[profile.bucketEnv]?.trim();
    const endpoint = process.env[profile.endpointEnv]?.trim();
    const accessKey = process.env[profile.accessKeyEnv]?.trim();
    const secretKey = process.env[profile.secretKeyEnv]?.trim();
    const configured = driver === "s3" && Boolean(bucket) && (!endpoint || Boolean(accessKey && secretKey));
    const evidence = {
      driver,
      bucket: bucket ?? null,
      provider: endpoint?.includes("r2.cloudflarestorage.com") ? "R2" : "S3",
      customEndpoint: Boolean(endpoint),
      encryptionEnabled: true,
      encryptionMode: endpoint?.includes("r2.cloudflarestorage.com")
        ? "R2_MANAGED_AES_256"
        : process.env[profile.sseEnv] === "false" ? "PROVIDER_MANAGED" : "SSE_AES_256",
      privateAccessExpected: true,
      directSignedUrls: profile.key === "storage-ats" && driver === "s3",
    };
    if (!configured || !activeProbe) {
      return this.configurationCheck(profile.key, profile.label, configured, activeProbe, evidence, "Almacenamiento privado configurado");
    }
    const key = `certification/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.txt`;
    const body = Buffer.from(`talentos-storage-certification:${randomUUID()}`);
    const expectedHash = createHash("sha256").update(body).digest("hex");
    const client = new S3Client({
      region: process.env[profile.regionEnv] ?? "us-east-1",
      endpoint,
      forcePathStyle: process.env[profile.forcePathStyleEnv] === "true",
      credentials: accessKey ? { accessKeyId: accessKey, secretAccessKey: secretKey ?? "" } : undefined,
      requestHandler: undefined,
    });
    let stored = false;
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket!,
        Key: key,
        Body: body,
        ContentType: "text/plain",
        ServerSideEncryption: process.env[profile.sseEnv] === "false" ? undefined : "AES256",
        Metadata: { purpose: "production-certification" },
      }));
      stored = true;
      const response = await client.send(new GetObjectCommand({ Bucket: bucket!, Key: key }));
      if (!response.Body) throw new Error("El objeto de prueba no devolvió contenido");
      const received = Buffer.from(await response.Body.transformToByteArray());
      const actualHash = createHash("sha256").update(received).digest("hex");
      if (actualHash !== expectedHash) throw new Error("La lectura no coincide con el objeto escrito");
      await client.send(new DeleteObjectCommand({ Bucket: bucket!, Key: key }));
      stored = false;
      return {
        key: profile.key,
        label: profile.label,
        status: "PASS",
        configured: true,
        activeProbe: true,
        summary: "Escritura, lectura íntegra y eliminación verificadas",
        durationMs: Date.now() - startedAt,
        evidence: { ...evidence, write: true, read: true, checksum: true, cleanup: true },
      };
    } catch (error) {
      return this.failedCheck(profile.key, profile.label, true, true, startedAt, evidence, error);
    } finally {
      if (stored) await client.send(new DeleteObjectCommand({ Bucket: bucket!, Key: key })).catch(() => undefined);
      client.destroy();
    }
  }

  private async certifyClamAv(activeProbe: boolean): Promise<IntegrationCertificationCheck> {
    const startedAt = Date.now();
    const mode = (process.env.ANTIVIRUS_MODE ?? process.env.SCORM_ANTIVIRUS_MODE ?? "disabled").toLowerCase();
    const configured = mode === "clamav";
    const evidence = {
      mode,
      hostConfigured: Boolean(process.env.CLAMAV_HOST),
      port: Number(process.env.CLAMAV_PORT ?? "3310"),
    };
    if (!configured || !activeProbe) {
      return this.configurationCheck("clamav", "Antivirus ClamAV", configured, activeProbe, evidence, "Escaneo antivirus obligatorio configurado");
    }
    try {
      const cleanResult = await this.scanClam(Buffer.from("talentos production certification clean payload"));
      const eicar = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
      const infectedResult = await this.scanClam(eicar);
      const cleanDetected = cleanResult.includes("OK");
      const threatDetected = infectedResult.includes("FOUND");
      if (!cleanDetected || !threatDetected) throw new Error("ClamAV no clasificó correctamente ambas muestras");
      return {
        key: "clamav",
        label: "Antivirus ClamAV",
        status: "PASS",
        configured: true,
        activeProbe: true,
        summary: "Archivo limpio aceptado y firma EICAR detectada",
        durationMs: Date.now() - startedAt,
        evidence: { ...evidence, cleanSample: "PASS", eicarDetection: "PASS" },
      };
    } catch (error) {
      return this.failedCheck("clamav", "Antivirus ClamAV", true, true, startedAt, evidence, error);
    }
  }

  private async certifyCalendars(activeProbe: boolean, tenantId?: string): Promise<IntegrationCertificationCheck> {
    const startedAt = Date.now();
    const encryptionConfigured = Boolean(process.env.CALENDAR_TOKEN_ENCRYPTION_KEY && process.env.CALENDAR_OAUTH_STATE_SECRET);
    const providers = {
      google: Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET),
      microsoft: Boolean(process.env.MICROSOFT_CALENDAR_CLIENT_ID && process.env.MICROSOFT_CALENDAR_CLIENT_SECRET),
    };
    const configured = encryptionConfigured && (providers.google || providers.microsoft);
    const evidence: Record<string, unknown> = { encryptionConfigured, providers, tenantScope: tenantId ?? "ALL" };
    if (!configured || !activeProbe) {
      return this.configurationCheck("calendars", "Calendarios", configured, activeProbe, evidence, "OAuth y cifrado de calendarios configurados");
    }
    try {
      const result = await this.calendars.certifyConnections(tenantId);
      const status: CertificationStatus = result.failed ? "FAIL" : result.activeConnections ? "PASS" : "WARN";
      return {
        key: "calendars",
        label: "Calendarios",
        status,
        configured: true,
        activeProbe: true,
        summary: result.failed
          ? "Hay conexiones de calendario inválidas"
          : result.activeConnections
            ? "Tokens y perfiles externos verificados"
            : "Configurado, pero no hay cuentas conectadas para certificar",
        durationMs: Date.now() - startedAt,
        evidence: { ...evidence, ...result },
      };
    } catch (error) {
      return this.failedCheck("calendars", "Calendarios", true, true, startedAt, evidence, error);
    }
  }

  private configurationCheck(
    key: string,
    label: string,
    configured: boolean,
    activeProbe: boolean,
    evidence: Record<string, unknown>,
    successSummary: string,
  ): IntegrationCertificationCheck {
    const production = process.env.NODE_ENV === "production";
    return {
      key,
      label,
      status: configured ? (activeProbe ? "SKIPPED" : "PASS") : production ? "FAIL" : "WARN",
      configured,
      activeProbe: false,
      summary: configured ? successSummary : "Configuración incompleta",
      durationMs: 0,
      evidence,
    };
  }

  private failedCheck(
    key: string,
    label: string,
    configured: boolean,
    activeProbe: boolean,
    startedAt: number,
    evidence: Record<string, unknown>,
    error: unknown,
  ): IntegrationCertificationCheck {
    return {
      key,
      label,
      status: "FAIL",
      configured,
      activeProbe,
      summary: "La comprobación de producción falló",
      durationMs: Date.now() - startedAt,
      evidence,
      error: this.safeError(error),
    };
  }

  private storageProfiles(): StorageProfile[] {
    return [
      { key: "storage-ats", label: "S3/R2 de ATS", driverEnv: "ATS_FILE_STORAGE_DRIVER", bucketEnv: "ATS_FILE_S3_BUCKET", regionEnv: "ATS_FILE_S3_REGION", endpointEnv: "ATS_FILE_S3_ENDPOINT", forcePathStyleEnv: "ATS_FILE_S3_FORCE_PATH_STYLE", accessKeyEnv: "ATS_FILE_S3_ACCESS_KEY_ID", secretKeyEnv: "ATS_FILE_S3_SECRET_ACCESS_KEY", sseEnv: "ATS_FILE_S3_SSE", defaultDriver: "local" },
      { key: "storage-documents", label: "S3/R2 documental", driverEnv: "DOCUMENT_STORAGE_DRIVER", bucketEnv: "DOCUMENT_S3_BUCKET", regionEnv: "DOCUMENT_S3_REGION", endpointEnv: "DOCUMENT_S3_ENDPOINT", forcePathStyleEnv: "DOCUMENT_S3_FORCE_PATH_STYLE", accessKeyEnv: "DOCUMENT_S3_ACCESS_KEY_ID", secretKeyEnv: "DOCUMENT_S3_SECRET_ACCESS_KEY", sseEnv: "DOCUMENT_S3_SSE", defaultDriver: "local" },
      { key: "storage-scorm", label: "S3/R2 de capacitación", driverEnv: "SCORM_STORAGE_DRIVER", bucketEnv: "SCORM_S3_BUCKET", regionEnv: "SCORM_S3_REGION", endpointEnv: "SCORM_S3_ENDPOINT", forcePathStyleEnv: "SCORM_S3_FORCE_PATH_STYLE", accessKeyEnv: "SCORM_S3_ACCESS_KEY_ID", secretKeyEnv: "SCORM_S3_SECRET_ACCESS_KEY", sseEnv: "SCORM_S3_SSE", defaultDriver: "filesystem" },
    ];
  }

  private senderDomain(sender?: string) {
    const email = sender?.match(/<([^>]+)>/)?.[1] ?? sender;
    return email?.includes("@") ? email.split("@").pop()?.toLowerCase() ?? null : null;
  }

  private fetchWithTimeout(url: string, init: RequestInit) {
    const controller = new AbortController();
    const timeoutMs = Math.min(Math.max(Number(process.env.CERTIFICATION_PROBE_TIMEOUT_MS ?? 12000), 1000), 60000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...init, signal: controller.signal, redirect: "error" }).finally(() => clearTimeout(timer));
  }

  private scanClam(buffer: Buffer) {
    const host = process.env.CLAMAV_HOST ?? "127.0.0.1";
    const port = Number(process.env.CLAMAV_PORT ?? "3310");
    const timeoutMs = Math.min(Math.max(Number(process.env.CERTIFICATION_PROBE_TIMEOUT_MS ?? 12000), 1000), 60000);
    return new Promise<string>((resolve, reject) => {
      const socket = createConnection({ host, port });
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("ClamAV excedió el tiempo de espera"));
      }, timeoutMs);
      socket.on("connect", () => {
        socket.write("zINSTREAM\0");
        const size = Buffer.alloc(4);
        size.writeUInt32BE(buffer.length);
        socket.write(size);
        socket.write(buffer);
        socket.end(Buffer.alloc(4));
      });
      socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      socket.on("end", () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
      socket.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private safeError(error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return message
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
      .replace(/(secret|token|key)=?[^\s,;]+/gi, "$1=[redacted]")
      .slice(0, 500);
  }
}
