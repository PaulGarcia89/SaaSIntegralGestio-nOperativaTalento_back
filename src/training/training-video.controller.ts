import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ModuleCode, TrainingVideoEventType } from '@prisma/client';
import type { Request, Response } from 'express';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { TrainingAccessGuard } from './training-access.guard';
import { TrainingObjectStorageService } from './training-object-storage.service';
import { TrainingVideoService } from './training-video.service';
import { enviarVideo } from './training-video-stream';
import {
  CreateTrainingVideoDto,
  StartTrainingVideoDto,
  TrainingVideoEventDto,
  TrainingVideoHeartbeatDto,
} from './dto/training-video.dto';

const trainingGuards = [JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, TrainingAccessGuard, PermissionGuard];

@Controller('training/video')
@UseGuards(...trainingGuards)
@RequireModule(ModuleCode.TRAINING)
export class TrainingVideoController {
  constructor(
    private readonly videos: TrainingVideoService,
    private readonly storage: TrainingObjectStorageService,
  ) {}

  @Post('start')
  @RequirePermissions('training.update')
  start(@Req() req: RequestWithUser, @Body() dto: StartTrainingVideoDto) {
    return this.videos.start(req.tenant!.id, req.user.sub, dto);
  }

  @Post('heartbeat')
  @RequirePermissions('training.update')
  heartbeat(@Req() req: RequestWithUser, @Body() dto: TrainingVideoHeartbeatDto) {
    return this.videos.heartbeat(req.tenant!.id, req.user.sub, dto, req);
  }

  @Post('pause')
  @RequirePermissions('training.update')
  pause(@Req() req: RequestWithUser, @Body() dto: TrainingVideoEventDto) {
    return this.videos.recordEvent(req.tenant!.id, req.user.sub, dto, TrainingVideoEventType.PAUSE);
  }

  @Post('ended')
  @RequirePermissions('training.update')
  ended(@Req() req: RequestWithUser, @Body() dto: TrainingVideoEventDto) {
    return this.videos.recordEvent(req.tenant!.id, req.user.sub, dto, TrainingVideoEventType.ENDED);
  }

  @Post('seek')
  @RequirePermissions('training.update')
  seek(@Req() req: RequestWithUser, @Body() dto: TrainingVideoEventDto) {
    return this.videos.recordEvent(req.tenant!.id, req.user.sub, dto, TrainingVideoEventType.SEEK);
  }

  @Get('assignments')
  @RequirePermissions('training.read')
  myAssignments(@Req() req: RequestWithUser) {
    return this.videos.listMyAssignments(req.tenant!.id, req.user.sub);
  }

  @Get('assignments/:assignmentId')
  @RequirePermissions('training.read')
  assignment(@Req() req: RequestWithUser, @Param('assignmentId') assignmentId: string) {
    return this.videos.getAssignment(req.tenant!.id, req.user.sub, assignmentId);
  }

  @Get('assignments/:assignmentId/progress')
  @RequirePermissions('training.read')
  progress(@Req() req: RequestWithUser, @Param('assignmentId') assignmentId: string) {
    return this.videos.progress(req.tenant!.id, req.user.sub, assignmentId);
  }

  @Get('assignments/:assignmentId/lessons/:lessonId/file')
  @RequirePermissions('training.read')
  async file(
    @Req() req: RequestWithUser,
    @Param('assignmentId') assignmentId: string,
    @Param('lessonId') lessonId: string,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ) {
    const asset = await this.videos.getVideoAsset(req.tenant!.id, req.user.sub, assignmentId, lessonId);
    await enviarVideo(this.storage, asset.storageKey, range, response);
  }
}

@Controller('training/admin/courses')
@UseGuards(...trainingGuards)
@RequireModule(ModuleCode.TRAINING)
export class TrainingVideoAdminController {
  constructor(
    private readonly videos: TrainingVideoService,
    private readonly storage: TrainingObjectStorageService,
  ) {}

  @Post(':courseId/video')
  @RequirePermissions('training.course.update')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({ destination: '/tmp' }),
    limits: { fileSize: Number(process.env.TRAINING_VIDEO_MAX_UPLOAD_BYTES ?? 500 * 1024 * 1024), files: 1 },
    /*
     * Rechazar con un ERROR, no con `callback(null, false)`.
     *
     * Con `false`, multer descarta el archivo en silencio y el controlador
     * recibe `file === undefined`: el servicio respondía entonces «A video file
     * or an authorized video URL is required», es decir, «no enviaste archivo»
     * a alguien que sí lo envió. Quien subía un .mov, o un .mp4 que su equipo
     * declara como `video/quicktime`, recibía un mensaje que apuntaba al sitio
     * equivocado y no tenía forma de averiguar que el problema era el formato.
     *
     * El tipo declarado por el navegador no es fiable —hay equipos donde un
     * .mp4 llega sin tipo o como `application/octet-stream`—, así que manda la
     * extensión y el tipo solo descarta cuando dice explícitamente otra cosa.
     * El servicio vuelve a comprobarlo: esto no relaja nada.
     */
    fileFilter: (_req, file, callback) => {
      const esMp4 = file.originalname.toLowerCase().endsWith('.mp4');
      const tipoContradice = Boolean(file.mimetype) && file.mimetype !== 'video/mp4' && file.mimetype !== 'application/octet-stream';
      if (!esMp4 || tipoContradice) {
        callback(new BadRequestException('Only MP4 video files are supported'), false);
        return;
      }
      callback(null, true);
    },
  }))
  video(
    @Req() req: RequestWithUser,
    @Param('courseId') courseId: string,
    @Body() dto: CreateTrainingVideoDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    req.auditAction = 'TRAINING_VIDEO_UPSERTED';
    return this.videos.createOrUpdateVideo(req.tenant!.id, req.user.sub, courseId, dto, file);
  }

  @Get(':courseId/lessons/:lessonId/video')
  @RequirePermissions('training.course.read')
  async adminVideo(
    @Req() req: RequestWithUser,
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ) {
    const asset = await this.videos.getAdminVideoAsset(req.tenant!.id, courseId, lessonId);
    await enviarVideo(this.storage, asset.storageKey, range, response);
  }

  @Get(':courseId/progress')
  @RequirePermissions('training.progress.read')
  progress(@Req() req: RequestWithUser, @Param('courseId') courseId: string) {
    return this.videos.report(req.tenant!.id, courseId);
  }
}
