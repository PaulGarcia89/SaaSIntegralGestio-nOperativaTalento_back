import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TrainingQuizAttemptStatus,
  TrainingQuizQuestionType,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreateTrainingQuizDto,
  CreateTrainingQuizQuestionDto,
  CreateTrainingQuestionBankItemDto,
  GradeTrainingAttemptDto,
  IssueTrainingCertificateDto,
  ListTrainingAssessmentResultsDto,
  ListTrainingQuestionBankDto,
  ImportTrainingQuestionBankItemsDto,
  RevokeTrainingCertificateDto,
  RenewTrainingCertificateDto,
  UpdateTrainingQuizDto,
  UpdateTrainingQuestionBankItemDto,
  UpdateTrainingCertificationPolicyDto,
} from './dto/training-assessment-admin.dto';
import { ReorderTrainingEntitiesDto } from './dto/training-course-authoring.dto';
import { TrainingWebhookDeliveryService } from './training-webhook-delivery.service';

@Injectable()
export class TrainingAssessmentAdminService {
  constructor(private readonly prisma: PrismaService, private readonly webhooks: TrainingWebhookDeliveryService) {}

  async listQuizzes(tenantId: string) {
    const items = await this.prisma.trainingQuiz.findMany({
      where: { course: { OR: [{ tenantId }, { tenantId: null }] } },
      include: {
        course: { select: { id: true, title: true, status: true } },
        questions: { include: { options: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
        _count: { select: { attempts: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return { items: items.map((quiz) => ({ ...quiz, readiness: this.assessmentReadiness(quiz) })) };
  }

  async getQuiz(tenantId: string, quizId: string) {
    const quiz = await this.prisma.trainingQuiz.findFirst({
      where: { id: quizId, course: { OR: [{ tenantId }, { tenantId: null }] } },
      include: {
        course: { select: { id: true, title: true } },
        questions: { include: { options: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!quiz) throw new NotFoundException('Training assessment not found');
    return { ...quiz, readiness: this.assessmentReadiness(quiz) };
  }

  async createQuiz(tenantId: string, courseId: string, dto: CreateTrainingQuizDto) {
    await this.assertOwnedCourse(tenantId, courseId);
    return this.prisma.trainingQuiz.create({
      data: {
        courseId,
        ...dto,
        availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : undefined,
        availableUntil: dto.availableUntil ? new Date(dto.availableUntil) : undefined,
        rubric: dto.rubric as Prisma.InputJsonValue | undefined,
        shuffleQuestions: dto.shuffleQuestions ?? false,
        shuffleOptions: dto.shuffleOptions ?? false,
        requireAllQuestions: dto.requireAllQuestions ?? true,
      },
      include: { course: { select: { id: true, title: true } }, questions: true },
    });
  }

  async updateQuiz(tenantId: string, quizId: string, dto: UpdateTrainingQuizDto) {
    const current = await this.getQuiz(tenantId, quizId);
    const availableFrom = dto.availableFrom ? new Date(dto.availableFrom) : current.availableFrom;
    const availableUntil = dto.availableUntil ? new Date(dto.availableUntil) : current.availableUntil;
    if (availableFrom && availableUntil && availableFrom >= availableUntil) {
      throw new BadRequestException('Assessment availability end must be after its start');
    }
    const questionCount = current.questions.length;
    if (dto.randomQuestionCount && dto.randomQuestionCount > questionCount) {
      throw new BadRequestException('Random question count exceeds available questions');
    }
    return this.prisma.trainingQuiz.update({
      where: { id: quizId },
      data: {
        ...dto,
        availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : undefined,
        availableUntil: dto.availableUntil ? new Date(dto.availableUntil) : undefined,
        rubric: dto.rubric as Prisma.InputJsonValue | undefined,
      },
      include: { course: { select: { id: true, title: true } }, questions: true },
    });
  }

  async deleteQuiz(tenantId: string, quizId: string) {
    const quiz = await this.getQuiz(tenantId, quizId);
    const attempts = await this.prisma.trainingQuizAttempt.count({ where: { quizId } });
    if (attempts > 0) throw new BadRequestException('An assessment with attempts cannot be deleted');
    await this.prisma.trainingQuiz.delete({ where: { id: quiz.id } });
    return { deleted: true };
  }

  async createQuestion(tenantId: string, quizId: string, dto: CreateTrainingQuizQuestionDto) {
    await this.getQuiz(tenantId, quizId);
    this.validateQuestion(dto);
    const sortOrder = await this.prisma.trainingQuizQuestion.count({ where: { quizId } });
    return this.prisma.trainingQuizQuestion.create({
      data: {
        quizId,
        prompt: dto.prompt,
        questionType: dto.questionType,
        explanation: dto.explanation,
        points: dto.points,
        requiresManualGrading:
          dto.requiresManualGrading ?? dto.questionType === TrainingQuizQuestionType.TEXT,
        category: dto.category,
        difficulty: dto.difficulty,
        tags: dto.tags ?? [],
        rubric: dto.rubric as Prisma.InputJsonValue | undefined,
        sortOrder,
        options: {
          create: dto.options.map((option, index) => ({
            label: option.label,
            isCorrect: option.isCorrect,
            sortOrder: index,
          })),
        },
      },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async updateQuestion(
    tenantId: string,
    questionId: string,
    dto: CreateTrainingQuizQuestionDto,
  ) {
    const question = await this.prisma.trainingQuizQuestion.findFirst({
      where: { id: questionId, quiz: { course: { OR: [{ tenantId }, { tenantId: null }] } } },
    });
    if (!question) throw new NotFoundException('Training assessment question not found');
    this.validateQuestion(dto);
    return this.prisma.$transaction(async (tx) => {
      await tx.trainingQuizOption.deleteMany({ where: { questionId } });
      return tx.trainingQuizQuestion.update({
        where: { id: questionId },
        data: {
          prompt: dto.prompt,
          questionType: dto.questionType,
          explanation: dto.explanation,
          points: dto.points,
          requiresManualGrading:
            dto.requiresManualGrading ?? dto.questionType === TrainingQuizQuestionType.TEXT,
          category: dto.category,
          difficulty: dto.difficulty,
          tags: dto.tags ?? [],
          rubric: dto.rubric as Prisma.InputJsonValue | undefined,
          options: {
            create: dto.options.map((option, index) => ({
              label: option.label,
              isCorrect: option.isCorrect,
              sortOrder: index,
            })),
          },
        },
        include: { options: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  }

  async deleteQuestion(tenantId: string, questionId: string) {
    const question = await this.prisma.trainingQuizQuestion.findFirst({
      where: { id: questionId, quiz: { course: { OR: [{ tenantId }, { tenantId: null }] } } },
    });
    if (!question) throw new NotFoundException('Training assessment question not found');
    const answers = await this.prisma.trainingQuizAnswer.count({ where: { questionId } });
    if (answers > 0) throw new BadRequestException('A question with answers cannot be deleted');
    await this.prisma.trainingQuizQuestion.delete({ where: { id: questionId } });
    return { deleted: true };
  }

  async reorderQuestions(tenantId: string, quizId: string, dto: ReorderTrainingEntitiesDto) {
    const quiz = await this.getQuiz(tenantId, quizId);
    const existing = new Set(quiz.questions.map((question) => question.id));
    if (existing.size !== dto.entityIds.length || dto.entityIds.some((id) => !existing.has(id))) {
      throw new BadRequestException('The order must include every assessment question exactly once');
    }
    await this.prisma.$transaction(dto.entityIds.map((id, sortOrder) =>
      this.prisma.trainingQuizQuestion.update({ where: { id }, data: { sortOrder } }),
    ));
    return { ordered: true, entityIds: dto.entityIds };
  }

  async listQuestionBank(tenantId: string, query: ListTrainingQuestionBankDto) {
    const where: Prisma.TrainingQuestionBankItemWhereInput = {
      tenantId,
      isActive: true,
      ...(query.search ? { prompt: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.trainingQuestionBankItem.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.trainingQuestionBankItem.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async createQuestionBankItem(tenantId: string, actorId: string, dto: CreateTrainingQuestionBankItemDto) {
    this.validateQuestion(dto);
    return this.prisma.trainingQuestionBankItem.create({
      data: {
        tenantId,
        createdById: actorId,
        prompt: dto.prompt,
        questionType: dto.questionType,
        explanation: dto.explanation,
        points: dto.points,
        requiresManualGrading: dto.requiresManualGrading ?? dto.questionType === TrainingQuizQuestionType.TEXT,
        category: dto.category,
        difficulty: dto.difficulty,
        tags: dto.tags ?? [],
        rubric: dto.rubric as Prisma.InputJsonValue | undefined,
        options: dto.options as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async updateQuestionBankItem(tenantId: string, itemId: string, dto: UpdateTrainingQuestionBankItemDto) {
    const item = await this.prisma.trainingQuestionBankItem.findFirst({ where: { id: itemId, tenantId, isActive: true } });
    if (!item) throw new NotFoundException('Question bank item not found');
    const merged = { ...item, ...dto, options: dto.options ?? (item.options as unknown as CreateTrainingQuizQuestionDto['options']) };
    this.validateQuestion(merged as CreateTrainingQuizQuestionDto);
    return this.prisma.trainingQuestionBankItem.update({
      where: { id: itemId },
      data: {
        ...dto,
        rubric: dto.rubric as Prisma.InputJsonValue | undefined,
        options: dto.options as unknown as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async archiveQuestionBankItem(tenantId: string, itemId: string) {
    const item = await this.prisma.trainingQuestionBankItem.findFirst({ where: { id: itemId, tenantId, isActive: true } });
    if (!item) throw new NotFoundException('Question bank item not found');
    await this.prisma.trainingQuestionBankItem.update({ where: { id: itemId }, data: { isActive: false } });
    return { archived: true, id: itemId };
  }

  async importBankItems(tenantId: string, quizId: string, dto: ImportTrainingQuestionBankItemsDto) {
    const quiz = await this.getQuiz(tenantId, quizId);
    const items = await this.prisma.trainingQuestionBankItem.findMany({
      where: { id: { in: dto.itemIds }, tenantId, isActive: true },
    });
    if (items.length !== dto.itemIds.length) {
      throw new BadRequestException('Every bank item must belong to the active tenant');
    }
    const byId = new Map(items.map((item) => [item.id, item]));
    const start = quiz.questions.length;
    await this.prisma.$transaction(dto.itemIds.map((itemId, index) => {
      const item = byId.get(itemId)!;
      const options = item.options as unknown as Array<{ label: string; isCorrect: boolean }>;
      return this.prisma.trainingQuizQuestion.create({
        data: {
          quizId,
          bankItemId: item.id,
          prompt: item.prompt,
          questionType: item.questionType,
          explanation: item.explanation,
          points: item.points,
          requiresManualGrading: item.requiresManualGrading,
          category: item.category,
          difficulty: item.difficulty,
          tags: item.tags,
          rubric: item.rubric as Prisma.InputJsonValue | undefined,
          sortOrder: start + index,
          options: { create: options.map((option, optionIndex) => ({ ...option, sortOrder: optionIndex })) },
        },
      });
    }));
    return this.getQuiz(tenantId, quizId);
  }

  async listResults(tenantId: string, query: ListTrainingAssessmentResultsDto) {
    const where: Prisma.TrainingQuizAttemptWhereInput = {
      tenantId,
      ...(query.courseId ? { quiz: { courseId: query.courseId } } : {}),
      ...(query.status ? { status: query.status as TrainingQuizAttemptStatus } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.trainingQuizAttempt.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          quiz: { include: { course: { select: { id: true, title: true } } } },
          answers: { include: { question: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.trainingQuizAttempt.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async gradeAttempt(
    tenantId: string,
    actorId: string,
    attemptId: string,
    dto: GradeTrainingAttemptDto,
  ) {
    const attempt = await this.prisma.trainingQuizAttempt.findFirst({
      where: { id: attemptId, tenantId },
      include: { quiz: { include: { questions: true } }, answers: true },
    });
    if (!attempt) throw new NotFoundException('Training assessment attempt not found');
    if (attempt.status === TrainingQuizAttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('The learner must submit the assessment first');
    }
    const answers = new Map(attempt.answers.map((answer) => [answer.id, answer]));
    for (const grade of dto.answers) {
      const answer = answers.get(grade.answerId);
      if (!answer) throw new BadRequestException('The answer does not belong to this attempt');
      const question = attempt.quiz.questions.find((item) => item.id === answer.questionId)!;
      if (grade.awardedPoints > question.points) {
        throw new BadRequestException('Awarded points exceed the question maximum');
      }
    }
    await this.prisma.$transaction(
      dto.answers.map((grade) =>
        this.prisma.trainingQuizAnswer.update({
          where: { id: grade.answerId },
          data: {
            awardedPoints: grade.awardedPoints,
            graderFeedback: grade.feedback,
            isCorrect: grade.awardedPoints > 0,
          },
        }),
      ),
    );
    const refreshed = await this.prisma.trainingQuizAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: { answers: true, quiz: { include: { questions: true } } },
    });
    const selectedQuestions = refreshed.questionIds.length
      ? refreshed.quiz.questions.filter((question) => refreshed.questionIds.includes(question.id))
      : refreshed.quiz.questions;
    const totalPoints = selectedQuestions.reduce((sum, question) => sum + question.points, 0);
    const earned = refreshed.answers.reduce((sum, answer) => sum + (answer.awardedPoints ?? 0), 0);
    const score = totalPoints === 0 ? 0 : Math.round((earned / totalPoints) * 100);
    const passed = score >= refreshed.quiz.passingScore;
    return this.prisma.trainingQuizAttempt.update({
      where: { id: attemptId },
      data: {
        score,
        passed,
        feedback: dto.feedback,
        gradedAt: new Date(),
        gradedById: actorId,
        status: TrainingQuizAttemptStatus.GRADED,
      },
    });
  }

  async listCertificates(tenantId: string) {
    const items = await this.prisma.trainingCertificate.findMany({
      where: { tenantId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        course: { select: { id: true, title: true } },
        curriculum: { select: { id: true, title: true } },
        policy: true,
        renewedFrom: { select: { id: true, certificateNumber: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });
    const now = new Date();
    return { items: items.map((certificate) => {
      const status = certificate.revokedAt
        ? 'REVOKED'
        : certificate.supersededAt
          ? 'RENEWED'
          : certificate.expiresAt && certificate.expiresAt < now
            ? 'EXPIRED'
            : 'VALID';
      const renewalEligible = Boolean(
        certificate.policy?.isEnabled &&
        certificate.expiresAt &&
        !certificate.revokedAt &&
        !certificate.supersededAt &&
        certificate.expiresAt.getTime() <= now.getTime() + certificate.policy.renewalWindowDays * 86_400_000,
      );
      return { ...certificate, status, renewalEligible };
    }) };
  }

  async getCertificationPolicy(tenantId: string, courseId: string) {
    await this.assertOwnedCourse(tenantId, courseId);
    const policy = await this.prisma.trainingCertificationPolicy.findUnique({
      where: { courseId },
      include: {
        course: {
          include: {
            quizzes: { include: { questions: { include: { options: true } } } },
            modules: { include: { lessons: true } },
          },
        },
      },
    });
    const value = policy ?? {
      courseId,
      tenantId,
      isEnabled: false,
      autoIssue: true,
      requireAssessment: true,
      requireAllRequiredLessons: true,
      validityDays: null,
      renewalWindowDays: 30,
      reminderDays: [30, 7, 1],
      version: 0,
    };
    return { policy: value, readiness: this.certificationReadiness(value) };
  }

  async updateCertificationPolicy(
    tenantId: string,
    actorId: string,
    courseId: string,
    dto: UpdateTrainingCertificationPolicyDto,
  ) {
    await this.assertOwnedCourse(tenantId, courseId);
    if (dto.validityDays && dto.renewalWindowDays >= dto.validityDays) {
      throw new BadRequestException('Renewal window must be shorter than certificate validity');
    }
    await this.prisma.trainingCertificationPolicy.upsert({
      where: { courseId },
      update: { ...dto, version: { increment: 1 }, updatedById: actorId },
      create: { tenantId, courseId, ...dto, createdById: actorId, updatedById: actorId },
    });
    return this.getCertificationPolicy(tenantId, courseId);
  }

  async issueCertificate(tenantId: string, actorId: string, dto: IssueTrainingCertificateDto) {
    if (Boolean(dto.courseId) === Boolean(dto.curriculumId)) {
      throw new BadRequestException('Provide either courseId or curriculumId');
    }
    const existing = await this.prisma.trainingCertificate.findFirst({
      where: {
        tenantId,
        userId: dto.userId,
        courseId: dto.courseId,
        curriculumId: dto.curriculumId,
        revokedAt: null,
        supersededAt: null,
      },
    });
    const verificationCode = this.verificationCode();
    const certificate = existing
      ? await this.prisma.trainingCertificate.update({
          where: { id: existing.id },
          data: { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null },
        })
      : await this.prisma.trainingCertificate.create({
          data: {
            tenantId,
            userId: dto.userId,
            courseId: dto.courseId,
            curriculumId: dto.curriculumId,
            verificationCode,
            certificateNumber: this.certificateNumber(),
            certificateUrl: `/certificates/verify/${verificationCode}`,
            issuedAt: new Date(),
            expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
            issuedById: actorId,
            issuedReason: 'MANUAL',
            evidenceSnapshot: { source: 'MANUAL', actorId },
          },
        });
    await this.webhooks.publish(tenantId, 'certificate.issued', {
      certificateId: certificate.id,
      userId: certificate.userId,
      courseId: certificate.courseId,
      curriculumId: certificate.curriculumId,
      verificationCode: certificate.verificationCode,
    }, `certificate-issued-${certificate.id}`);
    return certificate;
  }

  async revokeCertificate(
    tenantId: string,
    actorId: string,
    certificateId: string,
    dto: RevokeTrainingCertificateDto,
  ) {
    const certificate = await this.prisma.trainingCertificate.findFirst({
      where: { id: certificateId, tenantId },
    });
    if (!certificate) throw new NotFoundException('Training certificate not found');
    return this.prisma.trainingCertificate.update({
      where: { id: certificateId },
      data: { revokedAt: new Date(), revokedById: actorId, revocationReason: dto.reason },
    });
  }

  async renewCertificate(
    tenantId: string,
    actorId: string,
    certificateId: string,
    dto: RenewTrainingCertificateDto,
  ) {
    const certificate = await this.prisma.trainingCertificate.findFirst({
      where: { id: certificateId, tenantId },
      include: { policy: true },
    });
    if (!certificate) throw new NotFoundException('Training certificate not found');
    if (certificate.revokedAt || certificate.supersededAt) {
      throw new BadRequestException('Only an active certificate can be renewed');
    }
    if (!certificate.courseId || !certificate.policy?.isEnabled) {
      throw new BadRequestException('An active certification policy is required for renewal');
    }
    if (!certificate.expiresAt || !certificate.policy.validityDays) {
      throw new BadRequestException('This certificate does not expire and cannot be renewed');
    }
    const policy = certificate.policy;
    const now = new Date();
    const renewalOpensAt = new Date(
      certificate.expiresAt.getTime() - policy.renewalWindowDays * 86_400_000,
    );
    if (now < renewalOpensAt) {
      throw new BadRequestException('The renewal window is not open yet');
    }
    const verificationCode = this.verificationCode();
    const renewed = await this.prisma.$transaction(async (tx) => {
      await tx.trainingCertificate.update({
        where: { id: certificate.id },
        data: { supersededAt: now },
      });
      return tx.trainingCertificate.create({
        data: {
          tenantId,
          userId: certificate.userId,
          courseId: certificate.courseId,
          policyId: policy.id,
          policyVersion: policy.version,
          verificationCode,
          certificateNumber: this.certificateNumber(),
          certificateUrl: `/certificates/verify/${verificationCode}`,
          issuedAt: now,
          expiresAt: this.addDays(now, policy.validityDays!),
          issuedById: actorId,
          issuedReason: 'RENEWAL',
          renewedFromId: certificate.id,
          evidenceSnapshot: {
            sourceCertificateId: certificate.id,
            reason: dto.reason ?? 'Scheduled renewal',
          },
        },
      });
    });
    await this.webhooks.publish(tenantId, 'certificate.renewed', {
      certificateId: renewed.id,
      renewedFromId: certificate.id,
      userId: certificate.userId,
      courseId: certificate.courseId,
    }, `certificate-renewed-${renewed.id}`);
    return renewed;
  }

  async verifyCertificate(code: string) {
    const certificate = await this.prisma.trainingCertificate.findUnique({
      where: { verificationCode: code.toUpperCase() },
      include: {
        user: { select: { firstName: true, lastName: true } },
        course: { select: { title: true } },
        curriculum: { select: { title: true } },
        tenant: { select: { name: true } },
      },
    });
    if (!certificate) throw new NotFoundException('Training certificate not found');
    const expired = Boolean(certificate.expiresAt && certificate.expiresAt < new Date());
    return {
      verificationCode: certificate.verificationCode,
      certificateNumber: certificate.certificateNumber,
      learnerName: `${certificate.user.firstName} ${certificate.user.lastName}`.trim(),
      title: certificate.course?.title ?? certificate.curriculum?.title,
      organization: certificate.tenant.name,
      issuedAt: certificate.issuedAt,
      expiresAt: certificate.expiresAt,
      status: certificate.revokedAt ? 'REVOKED' : certificate.supersededAt ? 'RENEWED' : expired ? 'EXPIRED' : 'VALID',
      revocationReason: certificate.revocationReason,
    };
  }

  private assessmentReadiness(quiz: {
    questions: Array<{
      questionType: TrainingQuizQuestionType;
      requiresManualGrading: boolean;
      rubric?: unknown;
      options: Array<{ isCorrect: boolean }>;
    }>;
    randomQuestionCount?: number | null;
    availableFrom?: Date | null;
    availableUntil?: Date | null;
  }) {
    const errors = [
      quiz.questions.length === 0 ? 'Agrega al menos una pregunta' : null,
      quiz.randomQuestionCount && quiz.randomQuestionCount > quiz.questions.length
        ? 'La selección aleatoria excede las preguntas disponibles'
        : null,
      quiz.availableFrom && quiz.availableUntil && quiz.availableFrom >= quiz.availableUntil
        ? 'La ventana de disponibilidad no es válida'
        : null,
      quiz.questions.some((question) => question.requiresManualGrading && !question.rubric)
        ? 'Las preguntas manuales requieren una rúbrica'
        : null,
    ].filter(Boolean);
    return { ready: errors.length === 0, errors };
  }

  private certificationReadiness(policy: any) {
    const errors = [
      !policy.isEnabled ? 'Activa la certificación para este curso' : null,
      policy.isEnabled && policy.requireAssessment && policy.course &&
      (!policy.course.quizzes.length || policy.course.quizzes.some((quiz: any) => !this.assessmentReadiness(quiz).ready))
        ? 'Configura al menos una evaluación lista'
        : null,
      policy.isEnabled && policy.requireAllRequiredLessons && policy.course &&
      policy.course.modules.some((module: any) => module.isRequired && module.lessons.length === 0)
        ? 'Todos los módulos obligatorios necesitan lecciones'
        : null,
      policy.validityDays && policy.renewalWindowDays >= policy.validityDays
        ? 'La ventana de renovación debe ser menor que la vigencia'
        : null,
    ].filter(Boolean);
    return { ready: errors.length === 0, errors };
  }

  private validateQuestion(dto: CreateTrainingQuizQuestionDto) {
    if (dto.questionType === TrainingQuizQuestionType.TEXT) return;
    if (dto.options.length < 2) throw new BadRequestException('At least two options are required');
    if (!dto.options.some((option) => option.isCorrect)) {
      throw new BadRequestException('At least one correct option is required');
    }
    if (
      (dto.questionType === TrainingQuizQuestionType.SINGLE_CHOICE ||
        dto.questionType === TrainingQuizQuestionType.TRUE_FALSE) &&
      dto.options.filter((option) => option.isCorrect).length !== 1
    ) {
      throw new BadRequestException('This question requires exactly one correct option');
    }
  }

  private async assertOwnedCourse(tenantId: string, courseId: string) {
    const course = await this.prisma.trainingCourse.findFirst({ where: { id: courseId, tenantId } });
    if (!course) throw new ForbiddenException('A tenant assessment requires a tenant-owned course');
  }

  private verificationCode() {
    return randomBytes(6).toString('hex').toUpperCase();
  }

  private certificateNumber() {
    return `CERT-${new Date().getUTCFullYear()}-${randomBytes(5).toString('hex').toUpperCase()}`;
  }

  private addDays(value: Date, days: number) {
    return new Date(value.getTime() + days * 86_400_000);
  }
}
