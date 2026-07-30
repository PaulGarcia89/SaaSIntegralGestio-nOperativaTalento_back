import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ModuleCode } from '@prisma/client';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { AddTrainingPathCourseDto, CreateTrainingLearningPathDto, CreateTrainingOnboardingRuleDto } from './dto/training-learning-path.dto';
import { TrainingAccessGuard } from './training-access.guard';
import { TrainingLearningPathService } from './training-learning-path.service';

@Controller('training/admin/learning-paths')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, TrainingAccessGuard, PermissionGuard)
@RequireModule(ModuleCode.TRAINING)
export class TrainingLearningPathController {
  constructor(private readonly service: TrainingLearningPathService) {}
  @Get() @RequirePermissions('training.course.read') list(@Req() request: RequestWithUser) { return this.service.list(request.tenant!.id); }
  @Post() @RequirePermissions('training.course.create') create(@Req() request: RequestWithUser, @Body() dto: CreateTrainingLearningPathDto) { request.auditAction = 'TRAINING_PATH_CREATED'; return this.service.create(request.tenant!.id, dto); }
  @Post(':id/courses') @RequirePermissions('training.course.update') add(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: AddTrainingPathCourseDto) { request.auditAction = 'TRAINING_PATH_COURSE_ADDED'; return this.service.addCourse(request.tenant!.id, id, dto); }
  @Delete(':id/courses/:courseId') @RequirePermissions('training.course.update') remove(@Req() request: RequestWithUser, @Param('id') id: string, @Param('courseId') courseId: string) { request.auditAction = 'TRAINING_PATH_COURSE_REMOVED'; return this.service.removeCourse(request.tenant!.id, id, courseId); }
  @Get('onboarding-rules') @RequirePermissions('training.assign') rules(@Req() request: RequestWithUser) { return this.service.listRules(request.tenant!.id); }
  @Post('onboarding-rules') @RequirePermissions('training.assign') createRule(@Req() request: RequestWithUser, @Body() dto: CreateTrainingOnboardingRuleDto) { request.auditAction = 'TRAINING_ONBOARDING_RULE_CREATED'; return this.service.createRule(request.tenant!.id, request.user.sub, dto); }
  @Delete('onboarding-rules/:id') @RequirePermissions('training.assign') deleteRule(@Req() request: RequestWithUser, @Param('id') id: string) { request.auditAction = 'TRAINING_ONBOARDING_RULE_DELETED'; return this.service.deleteRule(request.tenant!.id, id); }
}
