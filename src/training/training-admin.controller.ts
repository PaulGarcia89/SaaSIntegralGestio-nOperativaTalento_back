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
import { ModuleCode, TrainingCourseStatus } from '@prisma/client';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RequestWithUser } from '../common/types/request-with-user.type';
import {
  CreateTrainingCategoryDto,
  CreateTrainingContentBlockDto,
  CreateTrainingCourseDto,
  CreateTrainingCourseModuleDto,
  CreateTrainingCompetencyDto,
  CreateTrainingCoursePilotDto,
  CreateTrainingLessonDto,
  DuplicateTrainingCourseDto,
  ListTrainingAdminCoursesDto,
  ReorderTrainingEntitiesDto,
  RequestTrainingQualityReviewsDto,
  TrainingCourseTransitionOptionsDto,
  UpdateTrainingCategoryDto,
  UpdateTrainingContentBlockDto,
  UpdateTrainingCourseDto,
  UpdateTrainingCourseModuleDto,
  UpdateTrainingCompetencyDto,
  UpdateTrainingCourseDesignDto,
  UpdateTrainingLessonDto,
  UpdateTrainingCoursePilotStatusDto,
  DecideTrainingQualityReviewDto,
} from './dto/training-course-authoring.dto';
import { TrainingAccessGuard } from './training-access.guard';
import { TrainingAdminService } from './training-admin.service';

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
export class TrainingAdminController {
  constructor(private readonly service: TrainingAdminService) {}

  @Get('courses')
  @RequirePermissions('training.course.read')
  listCourses(@Req() request: RequestWithUser, @Query() query: ListTrainingAdminCoursesDto) {
    return this.service.listCourses(this.tenantId(request), request.user, query);
  }

  @Get('courses/:courseId')
  @RequirePermissions('training.course.read')
  getCourse(@Req() request: RequestWithUser, @Param('courseId') courseId: string) {
    return this.service.getCourse(this.tenantId(request), request.user, courseId);
  }

  @Get('courses/:courseId/preview')
  @RequirePermissions('training.course.read')
  previewCourse(@Req() request: RequestWithUser, @Param('courseId') courseId: string) {
    return this.service.getCourse(this.tenantId(request), request.user, courseId);
  }

  @Post('courses')
  @RequirePermissions('training.course.create')
  createCourse(@Req() request: RequestWithUser, @Body() dto: CreateTrainingCourseDto) {
    request.auditAction = 'TRAINING_COURSE_CREATED';
    return this.service.createCourse(this.tenantId(request), request.user, dto);
  }

  @Patch('courses/:courseId')
  @RequirePermissions('training.course.update')
  updateCourse(
    @Req() request: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: UpdateTrainingCourseDto,
  ) {
    request.auditAction = 'TRAINING_COURSE_UPDATED';
    return this.service.updateCourse(this.tenantId(request), request.user, courseId, dto);
  }

  @Post('courses/:courseId/duplicate')
  @RequirePermissions('training.course.create')
  duplicateCourse(
    @Req() request: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: DuplicateTrainingCourseDto,
  ) {
    request.auditAction = 'TRAINING_COURSE_DUPLICATED';
    return this.service.duplicateCourse(this.tenantId(request), request.user, courseId, dto);
  }

  @Get('courses/:courseId/design')
  @RequirePermissions('training.course.read')
  getCourseDesign(@Req() request: RequestWithUser, @Param('courseId') courseId: string) {
    return this.service.getCourseDesign(this.tenantId(request), request.user, courseId);
  }

  @Put('courses/:courseId/design')
  @RequirePermissions('training.course.update')
  updateCourseDesign(@Req() request: RequestWithUser, @Param('courseId') courseId: string, @Body() dto: UpdateTrainingCourseDesignDto) {
    request.auditAction = 'TRAINING_COURSE_DESIGN_UPDATED';
    return this.service.updateCourseDesign(this.tenantId(request), request.user, courseId, dto);
  }

  @Get('competencies')
  @RequirePermissions('training.course.read')
  listCompetencies(@Req() request: RequestWithUser) {
    return this.service.listCompetencies(this.tenantId(request), request.user);
  }

  @Post('competencies')
  @RequirePermissions('training.course.create')
  createCompetency(@Req() request: RequestWithUser, @Body() dto: CreateTrainingCompetencyDto) {
    request.auditAction = 'TRAINING_COMPETENCY_CREATED';
    return this.service.createCompetency(this.tenantId(request), request.user, dto);
  }

  @Patch('competencies/:competencyId')
  @RequirePermissions('training.course.update')
  updateCompetency(@Req() request: RequestWithUser, @Param('competencyId') competencyId: string, @Body() dto: UpdateTrainingCompetencyDto) {
    request.auditAction = 'TRAINING_COMPETENCY_UPDATED';
    return this.service.updateCompetency(this.tenantId(request), request.user, competencyId, dto);
  }

  @Post('courses/:courseId/submit-review')
  @RequirePermissions('training.course.review')
  submitReview(
    @Req() request: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: TrainingCourseTransitionOptionsDto,
  ) {
    return this.transition(request, courseId, dto, TrainingCourseStatus.IN_REVIEW);
  }

  @Post('courses/:courseId/return-draft')
  @RequirePermissions('training.course.review')
  returnDraft(
    @Req() request: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: TrainingCourseTransitionOptionsDto,
  ) {
    return this.transition(request, courseId, dto, TrainingCourseStatus.DRAFT);
  }

  @Post('courses/:courseId/approve')
  @RequirePermissions('training.course.approve')
  approve(
    @Req() request: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: TrainingCourseTransitionOptionsDto,
  ) {
    return this.transition(request, courseId, dto, TrainingCourseStatus.APPROVED);
  }

  @Post('courses/:courseId/schedule')
  @RequirePermissions('training.course.publish')
  schedule(
    @Req() request: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: TrainingCourseTransitionOptionsDto,
  ) {
    return this.transition(request, courseId, dto, TrainingCourseStatus.SCHEDULED);
  }

  @Post('courses/:courseId/publish')
  @RequirePermissions('training.course.publish')
  publish(
    @Req() request: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: TrainingCourseTransitionOptionsDto,
  ) {
    return this.transition(request, courseId, dto, TrainingCourseStatus.PUBLISHED);
  }

  @Post('courses/:courseId/pause')
  @RequirePermissions('training.course.publish')
  pause(
    @Req() request: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: TrainingCourseTransitionOptionsDto,
  ) {
    return this.transition(request, courseId, dto, TrainingCourseStatus.PAUSED);
  }

  @Post('courses/:courseId/archive')
  @RequirePermissions('training.course.archive')
  archive(
    @Req() request: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: TrainingCourseTransitionOptionsDto,
  ) {
    return this.transition(request, courseId, dto, TrainingCourseStatus.ARCHIVED);
  }

  @Post('courses/:courseId/retire')
  @RequirePermissions('training.course.archive')
  retire(
    @Req() request: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: TrainingCourseTransitionOptionsDto,
  ) {
    return this.transition(request, courseId, dto, TrainingCourseStatus.RETIRED);
  }

  @Delete('courses/:courseId')
  @RequirePermissions('training.course.delete')
  deleteCourse(@Req() request: RequestWithUser, @Param('courseId') courseId: string) {
    request.auditAction = 'TRAINING_COURSE_DELETED';
    return this.service.deleteCourse(this.tenantId(request), request.user, courseId);
  }

  @Get('courses/:courseId/quality')
  @RequirePermissions('training.course.read')
  getCourseQuality(@Req() request: RequestWithUser, @Param('courseId') courseId: string) {
    return this.service.getCourseQuality(this.tenantId(request), request.user, courseId);
  }

  @Post('courses/:courseId/quality/reviews')
  @RequirePermissions('training.course.review')
  requestQualityReviews(
    @Req() request: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: RequestTrainingQualityReviewsDto,
  ) {
    return this.service.requestQualityReviews(this.tenantId(request), request.user, courseId, dto);
  }

  @Patch('quality-reviews/:reviewId/decision')
  @RequirePermissions('training.course.approve')
  decideQualityReview(
    @Req() request: RequestWithUser,
    @Param('reviewId') reviewId: string,
    @Body() dto: DecideTrainingQualityReviewDto,
  ) {
    return this.service.decideQualityReview(this.tenantId(request), request.user, reviewId, dto);
  }

  @Post('courses/:courseId/pilots')
  @RequirePermissions('training.course.review')
  createCoursePilot(
    @Req() request: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: CreateTrainingCoursePilotDto,
  ) {
    return this.service.createCoursePilot(this.tenantId(request), request.user, courseId, dto);
  }

  @Patch('course-pilots/:pilotId/status')
  @RequirePermissions('training.course.review')
  updateCoursePilotStatus(
    @Req() request: RequestWithUser,
    @Param('pilotId') pilotId: string,
    @Body() dto: UpdateTrainingCoursePilotStatusDto,
  ) {
    return this.service.updateCoursePilotStatus(this.tenantId(request), request.user, pilotId, dto);
  }

  @Post('courses/:courseId/modules')
  @RequirePermissions('training.course.update')
  createModule(
    @Req() request: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: CreateTrainingCourseModuleDto,
  ) {
    request.auditAction = 'TRAINING_COURSE_MODULE_CREATED';
    return this.service.createModule(this.tenantId(request), request.user, courseId, dto);
  }

  @Patch('modules/:moduleId')
  @RequirePermissions('training.course.update')
  updateModule(
    @Req() request: RequestWithUser,
    @Param('moduleId') moduleId: string,
    @Body() dto: UpdateTrainingCourseModuleDto,
  ) {
    return this.service.updateModule(this.tenantId(request), request.user, moduleId, dto);
  }

  @Delete('modules/:moduleId')
  @RequirePermissions('training.course.update')
  deleteModule(@Req() request: RequestWithUser, @Param('moduleId') moduleId: string) {
    return this.service.deleteModule(this.tenantId(request), request.user, moduleId);
  }

  @Post('modules/:moduleId/duplicate')
  @RequirePermissions('training.course.update')
  duplicateModule(@Req() request: RequestWithUser, @Param('moduleId') moduleId: string) {
    return this.service.duplicateModule(this.tenantId(request), request.user, moduleId);
  }

  @Put('courses/:courseId/modules/order')
  @RequirePermissions('training.course.update')
  reorderModules(
    @Req() request: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: ReorderTrainingEntitiesDto,
  ) {
    return this.service.reorderModules(this.tenantId(request), request.user, courseId, dto);
  }

  @Post('modules/:moduleId/lessons')
  @RequirePermissions('training.course.update')
  createLesson(
    @Req() request: RequestWithUser,
    @Param('moduleId') moduleId: string,
    @Body() dto: CreateTrainingLessonDto,
  ) {
    return this.service.createLesson(this.tenantId(request), request.user, moduleId, dto);
  }

  @Patch('lessons/:lessonId')
  @RequirePermissions('training.course.update')
  updateLesson(
    @Req() request: RequestWithUser,
    @Param('lessonId') lessonId: string,
    @Body() dto: UpdateTrainingLessonDto,
  ) {
    return this.service.updateLesson(this.tenantId(request), request.user, lessonId, dto);
  }

  @Delete('lessons/:lessonId')
  @RequirePermissions('training.course.update')
  deleteLesson(@Req() request: RequestWithUser, @Param('lessonId') lessonId: string) {
    return this.service.deleteLesson(this.tenantId(request), request.user, lessonId);
  }

  @Post('lessons/:lessonId/duplicate')
  @RequirePermissions('training.course.update')
  duplicateLesson(@Req() request: RequestWithUser, @Param('lessonId') lessonId: string) {
    return this.service.duplicateLesson(this.tenantId(request), request.user, lessonId);
  }

  @Put('modules/:moduleId/lessons/order')
  @RequirePermissions('training.course.update')
  reorderLessons(
    @Req() request: RequestWithUser,
    @Param('moduleId') moduleId: string,
    @Body() dto: ReorderTrainingEntitiesDto,
  ) {
    return this.service.reorderLessons(this.tenantId(request), request.user, moduleId, dto);
  }

  @Post('lessons/:lessonId/blocks')
  @RequirePermissions('training.course.update')
  createBlock(
    @Req() request: RequestWithUser,
    @Param('lessonId') lessonId: string,
    @Body() dto: CreateTrainingContentBlockDto,
  ) {
    return this.service.createBlock(this.tenantId(request), request.user, lessonId, dto);
  }

  @Patch('blocks/:blockId')
  @RequirePermissions('training.course.update')
  updateBlock(
    @Req() request: RequestWithUser,
    @Param('blockId') blockId: string,
    @Body() dto: UpdateTrainingContentBlockDto,
  ) {
    return this.service.updateBlock(this.tenantId(request), request.user, blockId, dto);
  }

  @Delete('blocks/:blockId')
  @RequirePermissions('training.course.update')
  deleteBlock(@Req() request: RequestWithUser, @Param('blockId') blockId: string) {
    return this.service.deleteBlock(this.tenantId(request), request.user, blockId);
  }

  @Post('blocks/:blockId/duplicate')
  @RequirePermissions('training.course.update')
  duplicateBlock(@Req() request: RequestWithUser, @Param('blockId') blockId: string) {
    return this.service.duplicateBlock(this.tenantId(request), request.user, blockId);
  }

  @Put('lessons/:lessonId/blocks/order')
  @RequirePermissions('training.course.update')
  reorderBlocks(
    @Req() request: RequestWithUser,
    @Param('lessonId') lessonId: string,
    @Body() dto: ReorderTrainingEntitiesDto,
  ) {
    return this.service.reorderBlocks(this.tenantId(request), request.user, lessonId, dto);
  }

  @Get('categories')
  @RequirePermissions('training.course.read')
  listCategories(@Req() request: RequestWithUser) {
    return this.service.listCategories(this.tenantId(request), request.user);
  }

  @Post('categories')
  @RequirePermissions('training.course.create')
  createCategory(@Req() request: RequestWithUser, @Body() dto: CreateTrainingCategoryDto) {
    request.auditAction = 'TRAINING_CATEGORY_CREATED';
    return this.service.createCategory(this.tenantId(request), request.user, dto);
  }

  @Patch('categories/:categoryId')
  @RequirePermissions('training.course.update')
  updateCategory(
    @Req() request: RequestWithUser,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateTrainingCategoryDto,
  ) {
    request.auditAction = 'TRAINING_CATEGORY_UPDATED';
    return this.service.updateCategory(this.tenantId(request), request.user, categoryId, dto);
  }

  private transition(
    request: RequestWithUser,
    courseId: string,
    dto: TrainingCourseTransitionOptionsDto,
    status: TrainingCourseStatus,
  ) {
    request.auditAction = `TRAINING_COURSE_${status}`;
    return this.service.transitionCourse(this.tenantId(request), request.user, courseId, {
      ...dto,
      status,
    });
  }

  private tenantId(request: RequestWithUser) {
    return request.tenant?.id ?? request.user.activeTenantId ?? request.user.tenantId;
  }
}
