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
  GradeTrainingAttemptDto,
  IssueTrainingCertificateDto,
  ListTrainingAssessmentResultsDto,
  RevokeTrainingCertificateDto,
  UpdateTrainingQuizDto,
} from './dto/training-assessment-admin.dto';
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
    return { items };
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
    return quiz;
  }

  async createQuiz(tenantId: string, courseId: string, dto: CreateTrainingQuizDto) {
    await this.assertOwnedCourse(tenantId, courseId);
    return this.prisma.trainingQuiz.create({
      data: { courseId, ...dto, shuffleQuestions: dto.shuffleQuestions ?? false },
      include: { course: { select: { id: true, title: true } }, questions: true },
    });
  }

  async updateQuiz(tenantId: string, quizId: string, dto: UpdateTrainingQuizDto) {
    await this.getQuiz(tenantId, quizId);
    return this.prisma.trainingQuiz.update({
      where: { id: quizId },
      data: dto,
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
    const totalPoints = refreshed.quiz.questions.reduce((sum, question) => sum + question.points, 0);
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
      },
      orderBy: { issuedAt: 'desc' },
    });
    return { items };
  }

  async issueCertificate(tenantId: string, actorId: string, dto: IssueTrainingCertificateDto) {
    if (Boolean(dto.courseId) === Boolean(dto.curriculumId)) {
      throw new BadRequestException('Provide either courseId or curriculumId');
    }
    const verificationCode = this.verificationCode();
    const certificate = await this.prisma.trainingCertificate.upsert({
      where: dto.courseId
        ? { tenantId_userId_courseId: { tenantId, userId: dto.userId, courseId: dto.courseId } }
        : {
            tenantId_userId_curriculumId: {
              tenantId,
              userId: dto.userId,
              curriculumId: dto.curriculumId!,
            },
          },
      update: {
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        revokedAt: null,
        revokedById: null,
        revocationReason: null,
      },
      create: {
        tenantId,
        userId: dto.userId,
        courseId: dto.courseId,
        curriculumId: dto.curriculumId,
        verificationCode,
        certificateUrl: `/certificates/verify/${verificationCode}`,
        issuedAt: new Date(),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        revokedById: null,
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
      learnerName: `${certificate.user.firstName} ${certificate.user.lastName}`.trim(),
      title: certificate.course?.title ?? certificate.curriculum?.title,
      organization: certificate.tenant.name,
      issuedAt: certificate.issuedAt,
      expiresAt: certificate.expiresAt,
      status: certificate.revokedAt ? 'REVOKED' : expired ? 'EXPIRED' : 'VALID',
      revocationReason: certificate.revocationReason,
    };
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
}
