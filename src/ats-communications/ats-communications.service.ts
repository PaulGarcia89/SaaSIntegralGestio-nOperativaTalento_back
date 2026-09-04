import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AtsCommunicationAudience,
  AtsCommunicationType,
  AtsMessageStatus,
  NotificationCategory,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationType,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../common/prisma/prisma.service";
import { AccessScope } from "../common/enums/access-scope.enum";
import { JwtPayload } from "../common/interfaces/jwt-payload.interface";
import { NotificationsService } from "../notifications/notifications.service";
import { message } from "../localization/catalogs/catalog";
import { SupportedLocale } from "../localization/localization.service";
import {
  CreateAtsCommunicationTemplateDto,
  SendOfferDto,
} from "./dto/ats-communication.dto";

type CommunicationClient = PrismaService | Prisma.TransactionClient;

export type EnqueueAtsEventInput = {
  tenantId: string;
  applicationId: string;
  type: AtsCommunicationType;
  audiences?: AtsCommunicationAudience[];
  stageCode?: string | null;
  interviewId?: string;
  scheduledAt?: Date;
  deduplicationSuffix: string;
  actorType?: string;
  actorId?: string;
  variables?: Record<string, string | null | undefined>;
  overrideBody?: string;
  overrideSubject?: string;
  inReplyToMessageId?: string;
};

// Las plantillas por defecto se resuelven en el idioma de CADA destinatario, no en
// el del reclutador que dispara el evento: el candidato recibe el correo en el idioma
// de su cuenta (CandidateAccount.locale) y el usuario interno en el suyo
// (User.preferredLocale). Las plantillas personalizadas del tenant son DATOS y no se
// traducen: se envian tal como el cliente las redacto.
const TEMPLATE_MESSAGE_KEYS: Record<
  AtsCommunicationType,
  { subject: string; body: string }
> = {
  APPLICATION_CONFIRMATION: {
    subject: "ats_comms.application_confirmation_subject",
    body: "ats_comms.application_confirmation_body",
  },
  STAGE_UPDATE: {
    subject: "ats_comms.stage_update_subject",
    body: "ats_comms.stage_update_body",
  },
  REJECTION: {
    subject: "ats_comms.rejection_subject",
    body: "ats_comms.rejection_body",
  },
  INTERVIEW_SCHEDULED: {
    subject: "ats_comms.interview_scheduled_subject",
    body: "ats_comms.interview_scheduled_body",
  },
  INTERVIEW_REMINDER: {
    subject: "ats_comms.interview_reminder_subject",
    body: "ats_comms.interview_reminder_body",
  },
  INTERVIEW_RESCHEDULED: {
    subject: "ats_comms.interview_rescheduled_subject",
    body: "ats_comms.interview_rescheduled_body",
  },
  INTERVIEW_CANCELLED: {
    subject: "ats_comms.interview_cancelled_subject",
    body: "ats_comms.interview_cancelled_body",
  },
  OFFER: {
    subject: "ats_comms.offer_subject",
    body: "ats_comms.offer_body",
  },
  APPROVAL_REQUEST: {
    subject: "ats_comms.approval_subject",
    body: "ats_comms.approval_body",
  },
  MANUAL: {
    subject: "ats_comms.generic_subject",
    body: "ats_comms.generic_body",
  },
};

function defaultTemplate(
  type: AtsCommunicationType,
  locale: SupportedLocale,
): { subject: string; body: string } {
  const keys = TEMPLATE_MESSAGE_KEYS[type];
  return {
    // Se pasa el texto sin interpolar: los {{marcadores}} los resuelve `render`
    // con las variables de la postulacion, igual que antes.
    subject: message(keys.subject as never, locale),
    body: message(keys.body as never, locale),
  };
}

function normalizeLocale(value: string | null | undefined): SupportedLocale {
  return value === "en" ? "en" : "es";
}

@Injectable()
export class AtsCommunicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async enqueueEvent(tx: CommunicationClient, input: EnqueueAtsEventInput) {
    const application = await tx.vacancyApplication.findFirst({
      where: { id: input.applicationId, tenantId: input.tenantId },
      include: {
        candidate: true,
        currentStage: true,
        vacancy: {
          include: {
            tenant: { select: { name: true } },
            responsibles: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    preferredLocale: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!application)
      throw new NotFoundException("Application not found for communication");

    const conversation = await tx.atsConversation.upsert({
      where: { applicationId: application.id },
      create: {
        tenantId: input.tenantId,
        applicationId: application.id,
        lastMessageAt: input.scheduledAt ?? new Date(),
      },
      update: {},
    });
    const communicationDomain = await tx.communicationDomain.findUnique({
      where: { tenantId: input.tenantId },
      select: { fromEmail: true },
    });

    const stageCode = input.stageCode ?? application.currentStage?.code ?? null;
    const variables = {
      candidateName: application.candidate.fullName,
      vacancyTitle: application.vacancy.title,
      companyName: application.vacancy.tenant.name,
      stageName: application.currentStage?.name ?? "",
      reason: "",
      interviewDate: "",
      interviewLocation: "",
      offerMessage: "",
      message: "",
      ...(input.variables ?? {}),
    };
    // Idioma del candidato: vive en su cuenta del portal, no en la sesion del
    // reclutador. Si aun no tiene cuenta creada, se usa el idioma por defecto.
    const candidateAccount = await tx.candidateAccount.findUnique({
      where: { email: application.candidate.email.toLowerCase() },
      select: {
        locale: true,
        statusUpdates: true,
        interviewReminders: true,
        offerNotifications: true,
      },
    });
    const candidateLocale = normalizeLocale(candidateAccount?.locale);
    const messages = [];
    for (const audience of input.audiences ?? [
      AtsCommunicationAudience.CANDIDATE,
    ]) {
      const recipients: {
        email: string;
        name: string;
        userId: string | null;
        locale: SupportedLocale;
      }[] =
        audience === AtsCommunicationAudience.CANDIDATE
          ? [
              {
                email: application.candidate.email,
                name: application.candidate.fullName,
                userId: null,
                locale: candidateLocale,
              },
            ]
          : application.vacancy.responsibles.map(({ user }) => ({
              email: user.email,
              name: `${user.firstName} ${user.lastName}`.trim(),
              userId: user.id,
              locale: normalizeLocale(user.preferredLocale),
            }));
      const template = await this.resolveTemplate(
        tx,
        input.tenantId,
        application.vacancyId,
        stageCode,
        input.type,
        audience,
      );
      for (const recipient of recipients) {
        const definition = template ?? defaultTemplate(input.type, recipient.locale);
        const deduplicationKey = [
          input.type,
          application.id,
          recipient.email.toLowerCase(),
          input.deduplicationSuffix,
        ].join(":");
        const existing = await tx.atsMessage.findUnique({
          where: {
            tenantId_deduplicationKey: {
              tenantId: input.tenantId,
              deduplicationKey,
            },
          },
        });
        if (existing) {
          messages.push(existing);
          continue;
        }
        const subject = input.overrideSubject?.trim() || this.render(definition.subject, variables);
        const body =
          input.overrideBody?.trim() || this.render(definition.body, variables);
        const notification = await tx.notification.create({
          data: {
            tenantId: input.tenantId,
            userId: recipient.userId,
            type: NotificationType.INFO,
            category: NotificationCategory.ATS,
            title: subject,
            message: body,
            sourceModule: "ATS",
            actionUrl: recipient.userId
              ? `/ats/candidates/${application.id}`
              : null,
            correlationId: randomUUID(),
            deduplicationKey: `ats-message:${deduplicationKey}`,
            payload: {
              applicationId: application.id,
              communicationType: input.type,
            },
          },
        });
        const candidatePreferences = recipient.userId
          ? null
          : candidateAccount;
        const emailEnabled = recipient.userId
          ? ((
              await tx.notificationPreference.findUnique({
                where: {
                  tenantId_userId_category: {
                    tenantId: input.tenantId,
                    userId: recipient.userId,
                    category: NotificationCategory.ATS,
                  },
                },
              })
            )?.emailEnabled ?? true)
          : input.type === AtsCommunicationType.OFFER
            ? (candidatePreferences?.offerNotifications ?? true)
            : ([
                AtsCommunicationType.INTERVIEW_SCHEDULED,
                AtsCommunicationType.INTERVIEW_REMINDER,
                AtsCommunicationType.INTERVIEW_RESCHEDULED,
                AtsCommunicationType.INTERVIEW_CANCELLED,
              ] as AtsCommunicationType[]).includes(input.type)
              ? (candidatePreferences?.interviewReminders ?? true)
              : (candidatePreferences?.statusUpdates ?? true);
        await tx.notificationDelivery.createMany({
          data: [
            ...(recipient.userId
              ? [
                  {
                    tenantId: input.tenantId,
                    userId: recipient.userId,
                    recipientEmail: recipient.email.toLowerCase(),
                    notificationId: notification.id,
                    channel: NotificationChannel.INTERNAL,
                    status: NotificationDeliveryStatus.DELIVERED,
                    deliveredAt: new Date(),
                    correlationId: notification.correlationId,
                  },
                ]
              : []),
            {
              tenantId: input.tenantId,
              userId: recipient.userId,
              recipientEmail: recipient.email.toLowerCase(),
              notificationId: notification.id,
              channel: NotificationChannel.EMAIL,
              status: emailEnabled
                ? NotificationDeliveryStatus.PENDING
                : NotificationDeliveryStatus.SKIPPED,
              nextAttemptAt: input.scheduledAt ?? new Date(),
              correlationId: notification.correlationId,
              lastError: emailEnabled
                ? null
                : recipient.userId
                  ? message("ats_comms.email_channel_disabled", recipient.locale)
                  : message("ats_comms.category_disabled", recipient.locale),
            },
          ],
        });
        messages.push(
          await tx.atsMessage.create({
            data: {
              tenantId: input.tenantId,
              vacancyId: application.vacancyId,
              applicationId: application.id,
              interviewId: input.interviewId,
              notificationId: notification.id,
              templateId: template?.id,
              templateVersion: template?.version,
              type: input.type,
              audience,
              conversationId: conversation.id,
              inReplyToMessageId: input.inReplyToMessageId,
              senderEmail: communicationDomain?.fromEmail,
              recipientEmail: recipient.email.toLowerCase(),
              recipientName: recipient.name,
              recipientUserId: recipient.userId,
              subject,
              body,
              scheduledAt: input.scheduledAt ?? new Date(),
              nextAttemptAt: input.scheduledAt ?? new Date(),
              deduplicationKey,
              correlationId: notification.correlationId,
              createdByType: input.actorType ?? "SYSTEM",
              createdById: input.actorId,
              payload: {
                stageCode,
                templateName: template?.name ?? "SYSTEM_DEFAULT",
                variables,
              },
            },
          }),
        );
        await tx.atsConversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: input.scheduledAt ?? new Date(),
            lastOutboundAt: input.scheduledAt ?? new Date(),
            archivedAt: null,
            snoozedUntil: null,
          },
        });
      }
    }
    return messages;
  }

  async createTemplate(
    tenantId: string,
    actor: JwtPayload,
    dto: CreateAtsCommunicationTemplateDto,
  ) {
    if (dto.vacancyId) {
      const vacancy = await this.prisma.vacancy.findFirst({
        where: {
          id: dto.vacancyId,
          tenantId,
          ...this.vacancyBranchScope(actor),
        },
        select: { id: true },
      });
      if (!vacancy) throw new NotFoundException("Vacancy not found");
    }
    const stageCode = dto.stageCode?.trim().toUpperCase() || null;
    const latest = await this.prisma.atsCommunicationTemplate.aggregate({
      where: {
        tenantId,
        vacancyId: dto.vacancyId ?? null,
        stageCode,
        type: dto.type,
        audience: dto.audience,
      },
      _max: { version: true },
    });
    return this.prisma.$transaction(async (tx) => {
      await tx.atsCommunicationTemplate.updateMany({
        where: {
          tenantId,
          vacancyId: dto.vacancyId ?? null,
          stageCode,
          type: dto.type,
          audience: dto.audience,
          isActive: true,
        },
        data: { isActive: false },
      });
      return tx.atsCommunicationTemplate.create({
        data: {
          tenantId,
          vacancyId: dto.vacancyId,
          stageCode,
          type: dto.type,
          audience: dto.audience,
          name: dto.name.trim(),
          subject: dto.subject.trim(),
          body: dto.body.trim(),
          version: (latest._max.version ?? 0) + 1,
          isActive: dto.isActive ?? true,
          createdByUserId: actor.sub,
        },
      });
    });
  }

  listTemplates(tenantId: string, actor: JwtPayload, vacancyId?: string) {
    return this.prisma.atsCommunicationTemplate.findMany({
      where: {
        tenantId,
        ...(vacancyId ? { vacancyId } : {}),
        ...(actor.isSuperAdmin || actor.scope !== AccessScope.BRANCH
          ? {}
          : {
              OR: [
                { vacancyId: null },
                { vacancy: { branchId: { in: actor.allowedBranchIds } } },
              ],
            }),
      },
      orderBy: [{ type: "asc" }, { stageCode: "asc" }, { version: "desc" }],
    });
  }

  async listHistory(
    tenantId: string,
    actor: JwtPayload,
    applicationId: string,
  ) {
    await this.assertApplicationAccess(tenantId, actor, applicationId);
    const messages = await this.prisma.atsMessage.findMany({
      where: { tenantId, applicationId },
      include: {
        notification: {
          include: { deliveries: { orderBy: { createdAt: "asc" } } },
        },
        template: { select: { id: true, name: true, version: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return messages.map((message) => ({
      ...message,
      eventKey: this.communicationEventKey(message.id, message.deduplicationKey),
      status:
        message.status === AtsMessageStatus.CANCELLED
          ? message.status
          : (message.notification?.deliveries.find(
              (item) => item.channel === NotificationChannel.EMAIL,
            )?.status ?? message.status),
    }));
  }

  async retryMessage(actor: JwtPayload, tenantId: string, id: string) {
    const message = await this.prisma.atsMessage.findFirst({
      where: {
        id,
        tenantId,
        application: {
          vacancy: this.vacancyBranchScope(actor),
        },
      },
      include: { notification: { include: { deliveries: true } } },
    });
    if (!message) throw new NotFoundException("ATS message not found");
    const delivery = message.notification?.deliveries.find(
      (item) => item.channel === NotificationChannel.EMAIL,
    );
    if (!delivery) throw new BadRequestException("Email delivery not found");
    return this.notifications.retryDelivery(actor, delivery.id, true);
  }

  async sendOffer(
    tenantId: string,
    actor: JwtPayload,
    applicationId: string,
    dto: SendOfferDto,
  ) {
    await this.assertApplicationAccess(tenantId, actor, applicationId);
    return this.prisma.$transaction((tx) =>
      this.enqueueEvent(tx, {
        tenantId,
        applicationId,
        type: AtsCommunicationType.OFFER,
        audiences: [
          AtsCommunicationAudience.CANDIDATE,
          AtsCommunicationAudience.RESPONSIBLE,
        ],
        deduplicationSuffix: `manual:${randomUUID()}`,
        actorType: "USER",
        actorId: actor.sub,
        variables: { offerMessage: dto.message ?? "" },
        overrideBody: dto.message,
      }),
    );
  }

  async cancelPendingInterviewMessages(
    tx: CommunicationClient,
    interviewId: string,
    types: AtsCommunicationType[] = [AtsCommunicationType.INTERVIEW_REMINDER],
  ) {
    const messages = await tx.atsMessage.findMany({
      where: {
        interviewId,
        type: { in: types },
        status: { not: AtsMessageStatus.CANCELLED },
      },
      select: { id: true, notificationId: true },
    });
    await tx.atsMessage.updateMany({
      where: { id: { in: messages.map((item) => item.id) } },
      data: {
        status: AtsMessageStatus.CANCELLED,
        lastError: "Superseded by interview update",
      },
    });
    await tx.notificationDelivery.updateMany({
      where: {
        notificationId: {
          in: messages.flatMap((item) =>
            item.notificationId ? [item.notificationId] : [],
          ),
        },
        channel: NotificationChannel.EMAIL,
        status: {
          in: [
            NotificationDeliveryStatus.PENDING,
            NotificationDeliveryStatus.FAILED,
          ],
        },
      },
      data: {
        status: NotificationDeliveryStatus.SKIPPED,
        lastError: "Superseded by interview update",
      },
    });
  }

  private resolveTemplate(
    tx: CommunicationClient,
    tenantId: string,
    vacancyId: string,
    stageCode: string | null,
    type: AtsCommunicationType,
    audience: AtsCommunicationAudience,
  ) {
    return tx.atsCommunicationTemplate.findFirst({
      where: {
        tenantId,
        type,
        audience,
        isActive: true,
        OR: [
          { vacancyId, stageCode },
          { vacancyId, stageCode: null },
          { vacancyId: null, stageCode },
          { vacancyId: null, stageCode: null },
        ],
      },
      orderBy: [
        { vacancyId: "desc" },
        { stageCode: "desc" },
        { version: "desc" },
      ],
    });
  }

  private render(
    template: string,
    variables: Record<string, string | null | undefined>,
  ) {
    return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) =>
      String(variables[key] ?? ""),
    );
  }

  private communicationEventKey(messageId: string, deduplicationKey: string) {
    const parts = deduplicationKey.split(":");
    if (parts.length < 4) return `message:${messageId}`;

    // Event messages differ only by the recipient segment at index 2.
    return [parts[0], parts[1], ...parts.slice(3)].join(":");
  }

  private async assertApplicationAccess(
    tenantId: string,
    actor: JwtPayload,
    applicationId: string,
  ) {
    const application = await this.prisma.vacancyApplication.findFirst({
      where: {
        id: applicationId,
        tenantId,
        vacancy: this.vacancyBranchScope(actor),
      },
      select: { id: true },
    });
    if (!application) throw new NotFoundException("Application not found");
  }

  private vacancyBranchScope(actor: JwtPayload): Prisma.VacancyWhereInput {
    if (actor.isSuperAdmin || actor.scope !== AccessScope.BRANCH) return {};
    return { branchId: { in: actor.allowedBranchIds } };
  }
}
