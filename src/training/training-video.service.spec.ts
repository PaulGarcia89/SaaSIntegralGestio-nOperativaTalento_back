import { ForbiddenException } from '@nestjs/common';
import { TrainingVideoService } from './training-video.service';

describe('TrainingVideoService', () => {
  const request = { ip: '127.0.0.1', headers: { 'user-agent': 'test-agent' } } as any;

  function setup(existing: any) {
    const tx = {
      trainingVideoProgress: {
        findUnique: jest.fn().mockResolvedValue(existing),
        upsert: jest.fn().mockImplementation(async ({ update, create }: any) => ({
          id: 'progress-1',
          watchedSeconds: update?.watchedSeconds ?? create.watchedSeconds,
          completionPercentage: update?.completionPercentage ?? create.completionPercentage,
          completedAt: update?.completedAt ?? create.completedAt ?? null,
        })),
      },
      trainingVideoProgressEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) },
      trainingAssignment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: 'assignment-1', status: 'IN_PROGRESS' }),
      },
    };
    const prisma = {
      trainingAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'assignment-1', tenantId: 'tenant-1', userId: 'user-1', courseId: 'course-1', dueAt: null,
        }),
      },
      trainingLesson: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'lesson-1', durationSeconds: 100, requiredCompletionPercentage: 90,
        }),
      },
      $transaction: jest.fn().mockImplementation((callback: any) => callback(tx)),
    };
    const service = new TrainingVideoService(prisma as any, {} as any);
    jest.spyOn(service as any, 'updateAssignmentCompletion').mockResolvedValue({ id: 'assignment-1' });
    return { service, prisma, tx };
  }

  it('credits only a reasonable playing interval', async () => {
    const previous = {
      id: 'progress-1', watchedSeconds: 10, completionPercentage: 10,
      lastPositionSeconds: 10, highestPositionSeconds: 10,
      lastHeartbeatAt: new Date(Date.now() - 10_000), startedAt: new Date('2026-08-23T10:00:00Z'),
      completedAt: null,
    };
    const { service, tx } = setup(previous);

    const result = await service.heartbeat('tenant-1', 'user-1', {
      assignmentId: 'assignment-1', lessonId: 'lesson-1', playbackSessionId: 'session-1',
      currentTimeSeconds: 20, durationSeconds: 100, isPlaying: true, playbackRate: 1,
      clientTimestamp: new Date().toISOString(),
    }, request);

    expect(result.watchedSeconds).toBe(20);
    expect(result.serverCompletionPercentage).toBe(20);
    expect(tx.trainingVideoProgressEvent.create).toHaveBeenCalled();
  });

  it('does not credit paused heartbeats or large seeks', async () => {
    const previous = {
      id: 'progress-1', watchedSeconds: 10, completionPercentage: 10,
      lastPositionSeconds: 10, highestPositionSeconds: 10,
      lastHeartbeatAt: new Date(Date.now() - 10_000), startedAt: new Date(), completedAt: null,
    };
    const { service: pausedService } = setup(previous);
    const paused = await pausedService.heartbeat('tenant-1', 'user-1', {
      assignmentId: 'assignment-1', lessonId: 'lesson-1', playbackSessionId: 'session-1',
      currentTimeSeconds: 10, durationSeconds: 100, isPlaying: false, playbackRate: 1,
      clientTimestamp: new Date().toISOString(),
    }, request);
    expect(paused.watchedSeconds).toBe(10);

    const { service: seekService } = setup(previous);
    const seek = await seekService.heartbeat('tenant-1', 'user-1', {
      assignmentId: 'assignment-1', lessonId: 'lesson-1', playbackSessionId: 'session-1',
      currentTimeSeconds: 95, durationSeconds: 100, isPlaying: true, playbackRate: 1,
      clientTimestamp: new Date().toISOString(),
    }, request);
    expect(seek.watchedSeconds).toBe(10);
    expect(seek.serverCompletionPercentage).toBe(10);
  });

  it('rejects an assignment from another tenant or user', async () => {
    const { service, prisma } = setup(null);
    prisma.trainingAssignment.findFirst.mockResolvedValue(null);

    await expect(service.heartbeat('tenant-2', 'user-2', {
      assignmentId: 'assignment-1', lessonId: 'lesson-1', playbackSessionId: 'session-1',
      currentTimeSeconds: 1, durationSeconds: 100, isPlaying: true, playbackRate: 1,
      clientTimestamp: new Date().toISOString(),
    }, request)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('preserves completedAt on repeated completion heartbeats', async () => {
    const firstCompletion = new Date('2026-08-23T10:00:00Z');
    const previous = {
      id: 'progress-1', watchedSeconds: 90, completionPercentage: 90,
      lastPositionSeconds: 90, highestPositionSeconds: 90,
      lastHeartbeatAt: new Date(Date.now() - 1_000), startedAt: new Date(), completedAt: firstCompletion,
    };
    const { service, tx } = setup(previous);
    const result = await service.heartbeat('tenant-1', 'user-1', {
      assignmentId: 'assignment-1', lessonId: 'lesson-1', playbackSessionId: 'session-1',
      currentTimeSeconds: 91, durationSeconds: 100, isPlaying: true, playbackRate: 1,
      clientTimestamp: new Date().toISOString(),
    }, request);

    expect(result.completedAt).toEqual(firstCompletion);
    expect(tx.trainingVideoProgressEvent.create).toHaveBeenCalledTimes(1);
  });
  it('requires contiguous playback for a 100 percent course', async () => {
    const {service,prisma}=setup({watchedSeconds:10,lastPositionSeconds:10,lastHeartbeatAt:new Date(Date.now()-10000),playbackSessionId:'s',completedAt:null});
    prisma.trainingLesson.findFirst.mockResolvedValue({id:'lesson-1',durationSeconds:100,requiredCompletionPercentage:100});
    const result=await service.heartbeat('tenant-1','user-1',{assignmentId:'assignment-1',lessonId:'lesson-1',playbackSessionId:'s',currentTimeSeconds:100,durationSeconds:100,isPlaying:true,clientTimestamp:new Date().toISOString()},request);
    expect(result.watchedSeconds).toBe(10);
    expect(result.completedAt).toBeNull();
  });
  it('does not count replayed sections twice in a strict course', async () => {
    const {service,prisma}=setup({watchedSeconds:50,lastPositionSeconds:10,lastHeartbeatAt:new Date(Date.now()-10000),playbackSessionId:'s',completedAt:null});
    prisma.trainingLesson.findFirst.mockResolvedValue({id:'lesson-1',durationSeconds:100,requiredCompletionPercentage:100});
    const result=await service.heartbeat('tenant-1','user-1',{assignmentId:'assignment-1',lessonId:'lesson-1',playbackSessionId:'s',currentTimeSeconds:20,durationSeconds:100,isPlaying:true,clientTimestamp:new Date().toISOString()},request);
    expect(result.watchedSeconds).toBe(50);
  });
  it('credits the final seconds and completes only at 100 percent', async () => {
    const {service,prisma}=setup({watchedSeconds:98,lastPositionSeconds:98,lastHeartbeatAt:new Date(Date.now()-2000),playbackSessionId:'s',completedAt:null});
    prisma.trainingLesson.findFirst.mockResolvedValue({id:'lesson-1',durationSeconds:100,requiredCompletionPercentage:100});
    const result=await service.heartbeat('tenant-1','user-1',{assignmentId:'assignment-1',lessonId:'lesson-1',playbackSessionId:'s',currentTimeSeconds:100,durationSeconds:100,isPlaying:true,clientTimestamp:new Date().toISOString()},request);
    expect(result.serverCompletionPercentage).toBe(100);
    expect(result.completedAt).toBeInstanceOf(Date);
  });

});
