import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ModuleCode } from '@prisma/client';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RequestWithUser } from '../common/types/request-with-user.type';
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
import { TrainingAccessGuard } from './training-access.guard';
import { TrainingAssessmentAdminService } from './training-assessment-admin.service';

@Controller('training/admin')
@UseGuards(
  JwtAuthGuard,
  TenantGuard,
  SubscriptionGuard,
  ModuleAccessGuard,
  TrainingAccessGuard,
  PermissionGuard,
)
@RequireModule(ModuleCode.TRAINING)
export class TrainingAssessmentAdminController {
  constructor(private readonly service: TrainingAssessmentAdminService) {}

  @Get('assessments')
  @RequirePermissions('training.assessment.manage')
  list(@Req() request: RequestWithUser) {
    return this.service.listQuizzes(this.tenantId(request));
  }

  @Get('assessments/:quizId')
  @RequirePermissions('training.assessment.manage')
  get(@Req() request: RequestWithUser, @Param('quizId') quizId: string) {
    return this.service.getQuiz(this.tenantId(request), quizId);
  }

  @Post('courses/:courseId/assessments')
  @RequirePermissions('training.assessment.manage')
  create(
    @Req() request: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: CreateTrainingQuizDto,
  ) {
    request.auditAction = 'TRAINING_ASSESSMENT_CREATED';
    return this.service.createQuiz(this.tenantId(request), courseId, dto);
  }

  @Patch('assessments/:quizId')
  @RequirePermissions('training.assessment.manage')
  update(
    @Req() request: RequestWithUser,
    @Param('quizId') quizId: string,
    @Body() dto: UpdateTrainingQuizDto,
  ) {
    request.auditAction = 'TRAINING_ASSESSMENT_UPDATED';
    return this.service.updateQuiz(this.tenantId(request), quizId, dto);
  }

  @Delete('assessments/:quizId')
  @RequirePermissions('training.assessment.manage')
  remove(@Req() request: RequestWithUser, @Param('quizId') quizId: string) {
    request.auditAction = 'TRAINING_ASSESSMENT_DELETED';
    return this.service.deleteQuiz(this.tenantId(request), quizId);
  }

  @Post('assessments/:quizId/questions')
  @RequirePermissions('training.assessment.manage')
  createQuestion(
    @Req() request: RequestWithUser,
    @Param('quizId') quizId: string,
    @Body() dto: CreateTrainingQuizQuestionDto,
  ) {
    return this.service.createQuestion(this.tenantId(request), quizId, dto);
  }

  @Patch('assessment-questions/:questionId')
  @RequirePermissions('training.assessment.manage')
  updateQuestion(
    @Req() request: RequestWithUser,
    @Param('questionId') questionId: string,
    @Body() dto: CreateTrainingQuizQuestionDto,
  ) {
    return this.service.updateQuestion(this.tenantId(request), questionId, dto);
  }

  @Delete('assessment-questions/:questionId')
  @RequirePermissions('training.assessment.manage')
  deleteQuestion(
    @Req() request: RequestWithUser,
    @Param('questionId') questionId: string,
  ) {
    return this.service.deleteQuestion(this.tenantId(request), questionId);
  }

  @Post('assessments/:quizId/questions/import')
  @RequirePermissions('training.assessment.manage')
  importQuestions(
    @Req() request: RequestWithUser,
    @Param('quizId') quizId: string,
    @Body() dto: ImportTrainingQuestionBankItemsDto,
  ) {
    return this.service.importBankItems(this.tenantId(request), quizId, dto);
  }

  @Put('assessments/:quizId/questions/order')
  @RequirePermissions('training.assessment.manage')
  reorderQuestions(
    @Req() request: RequestWithUser,
    @Param('quizId') quizId: string,
    @Body() dto: ReorderTrainingEntitiesDto,
  ) {
    return this.service.reorderQuestions(this.tenantId(request), quizId, dto);
  }

  @Get('assessment-question-bank')
  @RequirePermissions('training.assessment.manage')
  listQuestionBank(@Req() request: RequestWithUser, @Query() query: ListTrainingQuestionBankDto) {
    return this.service.listQuestionBank(this.tenantId(request), query);
  }

  @Post('assessment-question-bank')
  @RequirePermissions('training.assessment.manage')
  createQuestionBankItem(
    @Req() request: RequestWithUser,
    @Body() dto: CreateTrainingQuestionBankItemDto,
  ) {
    return this.service.createQuestionBankItem(this.tenantId(request), request.user.sub, dto);
  }

  @Patch('assessment-question-bank/:itemId')
  @RequirePermissions('training.assessment.manage')
  updateQuestionBankItem(
    @Req() request: RequestWithUser,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateTrainingQuestionBankItemDto,
  ) {
    return this.service.updateQuestionBankItem(this.tenantId(request), itemId, dto);
  }

  @Delete('assessment-question-bank/:itemId')
  @RequirePermissions('training.assessment.manage')
  archiveQuestionBankItem(@Req() request: RequestWithUser, @Param('itemId') itemId: string) {
    return this.service.archiveQuestionBankItem(this.tenantId(request), itemId);
  }

  @Get('assessment-results')
  @RequirePermissions('training.progress.read')
  results(
    @Req() request: RequestWithUser,
    @Query() query: ListTrainingAssessmentResultsDto,
  ) {
    return this.service.listResults(this.tenantId(request), query);
  }

  @Patch('assessment-attempts/:attemptId/grade')
  @RequirePermissions('training.assessment.grade')
  grade(
    @Req() request: RequestWithUser,
    @Param('attemptId') attemptId: string,
    @Body() dto: GradeTrainingAttemptDto,
  ) {
    request.auditAction = 'TRAINING_ASSESSMENT_GRADED';
    return this.service.gradeAttempt(this.tenantId(request), request.user.sub, attemptId, dto);
  }

  @Get('certificates')
  @RequirePermissions('training.progress.read')
  certificates(@Req() request: RequestWithUser) {
    return this.service.listCertificates(this.tenantId(request));
  }

  @Get('courses/:courseId/certification-policy')
  @RequirePermissions('training.course.read')
  certificationPolicy(@Req() request: RequestWithUser, @Param('courseId') courseId: string) {
    return this.service.getCertificationPolicy(this.tenantId(request), courseId);
  }

  @Put('courses/:courseId/certification-policy')
  @RequirePermissions('training.course.update')
  updateCertificationPolicy(
    @Req() request: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: UpdateTrainingCertificationPolicyDto,
  ) {
    request.auditAction = 'TRAINING_CERTIFICATION_POLICY_UPDATED';
    return this.service.updateCertificationPolicy(
      this.tenantId(request),
      request.user.sub,
      courseId,
      dto,
    );
  }

  @Post('certificates')
  @RequirePermissions('training.certificate.issue')
  issueCertificate(
    @Req() request: RequestWithUser,
    @Body() dto: IssueTrainingCertificateDto,
  ) {
    request.auditAction = 'TRAINING_CERTIFICATE_ISSUED';
    return this.service.issueCertificate(this.tenantId(request), request.user.sub, dto);
  }

  @Post('certificates/:certificateId/revoke')
  @RequirePermissions('training.certificate.revoke')
  revokeCertificate(
    @Req() request: RequestWithUser,
    @Param('certificateId') certificateId: string,
    @Body() dto: RevokeTrainingCertificateDto,
  ) {
    request.auditAction = 'TRAINING_CERTIFICATE_REVOKED';
    return this.service.revokeCertificate(
      this.tenantId(request),
      request.user.sub,
      certificateId,
      dto,
    );
  }

  @Post('certificates/:certificateId/renew')
  @RequirePermissions('training.certificate.issue')
  renewCertificate(
    @Req() request: RequestWithUser,
    @Param('certificateId') certificateId: string,
    @Body() dto: RenewTrainingCertificateDto,
  ) {
    request.auditAction = 'TRAINING_CERTIFICATE_RENEWED';
    return this.service.renewCertificate(
      this.tenantId(request),
      request.user.sub,
      certificateId,
      dto,
    );
  }

  private tenantId(request: RequestWithUser) {
    return request.tenant?.id ?? request.user.activeTenantId ?? request.user.tenantId;
  }
}

@Controller('public/training-certificates')
export class PublicTrainingCertificateController {
  constructor(private readonly service: TrainingAssessmentAdminService) {}

  @Get(':code')
  verify(@Param('code') code: string) {
    return this.service.verifyCertificate(code);
  }
}
