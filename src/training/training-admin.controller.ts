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
  CreateTrainingLessonDto,
  DuplicateTrainingCourseDto,
  ListTrainingAdminCoursesDto,
  TrainingCourseTransitionOptionsDto,
  UpdateTrainingCategoryDto,
  UpdateTrainingContentBlockDto,
  UpdateTrainingCourseDto,
  UpdateTrainingCourseModuleDto,
  UpdateTrainingLessonDto,
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
