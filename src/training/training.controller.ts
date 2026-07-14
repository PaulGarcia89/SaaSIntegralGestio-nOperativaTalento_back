import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { ListTrainingAssignmentsDto } from './dto/list-training-assignments.dto';
import { ListTrainingCatalogDto } from './dto/list-training-catalog.dto';
import { ListTrainingLibraryDto } from './dto/list-training-library.dto';
import { ListTrainingEventsDto } from './dto/list-training-events.dto';
import { CreateTrainingQuizAttemptAnswerDto } from './dto/create-training-quiz-attempt-answer.dto';
import { SubmitTrainingQuizAttemptDto } from './dto/submit-training-quiz-attempt.dto';
import { TrainingFavoriteDto } from './dto/training-favorite.dto';
import { UpdateTrainingCourseProgressDto } from './dto/update-training-course-progress.dto';
import { UpdateTrainingStepProgressDto } from './dto/update-training-step-progress.dto';
import { TrainingAccessGuard } from './training-access.guard';
import { TrainingService } from './training.service';

@Controller('training')
@UseGuards(JwtAuthGuard, TenantGuard)
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @Get('module-access')
  getModuleAccess(@Req() request: RequestWithUser) {
    return this.trainingService.getModuleAccess(request.tenant!.id, request.user);
  }

  @Get('overview')
  @UseGuards(SubscriptionGuard, TrainingAccessGuard, PermissionGuard)
  @RequirePermissions('training.read')
  getOverview(@Req() request: RequestWithUser) {
    return this.trainingService.getOverview(request.tenant!.id, request.user.sub);
  }

  @Get('assignments')
  @UseGuards(SubscriptionGuard, TrainingAccessGuard, PermissionGuard)
  @RequirePermissions('training.read')
  listAssignments(@Req() request: RequestWithUser, @Query() query: ListTrainingAssignmentsDto) {
    return this.trainingService.listAssignments(request.tenant!.id, request.user.sub, query);
  }

  @Get('catalog')
  @UseGuards(SubscriptionGuard, TrainingAccessGuard, PermissionGuard)
  @RequirePermissions('training.read')
  listCatalog(@Req() request: RequestWithUser, @Query() query: ListTrainingCatalogDto) {
    return this.trainingService.listCatalog(request.tenant!.id, request.user.sub, query);
  }

  @Get('library')
  @UseGuards(SubscriptionGuard, TrainingAccessGuard, PermissionGuard)
  @RequirePermissions('training.read')
  listLibrary(@Req() request: RequestWithUser, @Query() query: ListTrainingLibraryDto) {
    return this.trainingService.listLibrary(request.tenant!.id, request.user.sub, query);
  }

  @Get('events')
  @UseGuards(SubscriptionGuard, TrainingAccessGuard, PermissionGuard)
  @RequirePermissions('training.read')
  listEvents(@Req() request: RequestWithUser, @Query() query: ListTrainingEventsDto) {
    return this.trainingService.listEvents(request.tenant!.id, request.user.sub, query);
  }

  @Get('analytics')
  @UseGuards(SubscriptionGuard, TrainingAccessGuard, PermissionGuard)
  @RequirePermissions('training.read')
  getAnalytics(@Req() request: RequestWithUser) {
    return this.trainingService.getAnalytics(request.tenant!.id, request.user.sub);
  }

  @Get('courses/:courseId')
  @UseGuards(SubscriptionGuard, TrainingAccessGuard, PermissionGuard)
  @RequirePermissions('training.read')
  getCourse(@Req() request: RequestWithUser, @Param('courseId') courseId: string) {
    return this.trainingService.getCourseDetail(request.tenant!.id, request.user.sub, courseId);
  }

  @Get('curriculums/:curriculumId')
  @UseGuards(SubscriptionGuard, TrainingAccessGuard, PermissionGuard)
  @RequirePermissions('training.read')
  getCurriculum(@Req() request: RequestWithUser, @Param('curriculumId') curriculumId: string) {
    return this.trainingService.getCurriculumDetail(
      request.tenant!.id,
      request.user.sub,
      curriculumId,
    );
  }

  @Post('favorites')
  @UseGuards(SubscriptionGuard, TrainingAccessGuard, PermissionGuard)
  @RequirePermissions('training.update')
  createFavorite(@Req() request: RequestWithUser, @Body() dto: TrainingFavoriteDto) {
    return this.trainingService.createFavorite(request.tenant!.id, request.user.sub, dto);
  }

  @Delete('favorites')
  @UseGuards(SubscriptionGuard, TrainingAccessGuard, PermissionGuard)
  @RequirePermissions('training.update')
  deleteFavorite(@Req() request: RequestWithUser, @Body() dto: TrainingFavoriteDto) {
    return this.trainingService.deleteFavorite(request.tenant!.id, request.user.sub, dto);
  }

  @Patch('progress/course/:courseId')
  @UseGuards(SubscriptionGuard, TrainingAccessGuard, PermissionGuard)
  @RequirePermissions('training.update')
  updateCourseProgress(
    @Req() request: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: UpdateTrainingCourseProgressDto,
  ) {
    return this.trainingService.updateCourseProgress(request.tenant!.id, request.user.sub, courseId, dto);
  }

  @Patch('progress/step/:stepId')
  @UseGuards(SubscriptionGuard, TrainingAccessGuard, PermissionGuard)
  @RequirePermissions('training.update')
  updateStepProgress(
    @Req() request: RequestWithUser,
    @Param('stepId') stepId: string,
    @Body() dto: UpdateTrainingStepProgressDto,
  ) {
    return this.trainingService.updateStepProgress(request.tenant!.id, request.user.sub, stepId, dto);
  }

  @Post('quizzes/:quizId/attempts')
  @UseGuards(SubscriptionGuard, TrainingAccessGuard, PermissionGuard)
  @RequirePermissions('training.update')
  createAttempt(@Req() request: RequestWithUser, @Param('quizId') quizId: string) {
    return this.trainingService.createQuizAttempt(request.tenant!.id, request.user.sub, quizId);
  }

  @Post('quizzes/:quizId/attempts/:attemptId/answers')
  @UseGuards(SubscriptionGuard, TrainingAccessGuard, PermissionGuard)
  @RequirePermissions('training.update')
  answerAttempt(
    @Req() request: RequestWithUser,
    @Param('quizId') quizId: string,
    @Param('attemptId') attemptId: string,
    @Body() dto: CreateTrainingQuizAttemptAnswerDto,
  ) {
    return this.trainingService.answerQuizAttempt(
      request.tenant!.id,
      request.user.sub,
      quizId,
      attemptId,
      dto,
    );
  }

  @Post('quizzes/:quizId/attempts/:attemptId/submit')
  @UseGuards(SubscriptionGuard, TrainingAccessGuard, PermissionGuard)
  @RequirePermissions('training.update')
  submitAttempt(
    @Req() request: RequestWithUser,
    @Param('quizId') quizId: string,
    @Param('attemptId') attemptId: string,
    @Body() dto: SubmitTrainingQuizAttemptDto,
  ) {
    return this.trainingService.submitQuizAttempt(
      request.tenant!.id,
      request.user.sub,
      quizId,
      attemptId,
      dto,
    );
  }

  @Get('certificates')
  @UseGuards(SubscriptionGuard, TrainingAccessGuard, PermissionGuard)
  @RequirePermissions('training.read')
  listCertificates(@Req() request: RequestWithUser) {
    return this.trainingService.listCertificates(request.tenant!.id, request.user.sub);
  }
}
