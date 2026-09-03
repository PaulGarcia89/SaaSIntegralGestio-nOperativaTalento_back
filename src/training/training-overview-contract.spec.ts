import { TrainingProgressStatus } from '@prisma/client';
import { TrainingService } from './training.service';

describe('Training employee overview contract', () => {
  it('returns dashboard sections ordered by attention and due date', async () => {
    const service = new TrainingService({} as any, {} as any);
    const assignments = [
      { id: 'completed', status: TrainingProgressStatus.COMPLETED, isRequired: true, completedAt: new Date('2026-09-03') },
      { id: 'overdue', status: TrainingProgressStatus.OVERDUE, isRequired: true, dueAt: new Date('2026-08-01') },
      { id: 'progress', status: TrainingProgressStatus.IN_PROGRESS, isRequired: true, dueAt: new Date('2026-09-20') },
      { id: 'optional', status: TrainingProgressStatus.NOT_STARTED, isRequired: false, dueAt: null },
      { id: 'new', status: TrainingProgressStatus.NOT_STARTED, isRequired: true, dueAt: new Date('2026-09-10') },
    ];
    jest.spyOn(service as any, 'findAssignments').mockResolvedValue(assignments);
    jest.spyOn(service as any, 'findUpcomingEvents').mockResolvedValue([]);
    jest.spyOn(service as any, 'syncAnalyticsSnapshot').mockResolvedValue({ completionRate: 20, certificatesEarned: 1, totalMinutes: 30 });

    const overview = await service.getOverview('tenant-1', 'user-1');

    expect(overview.attentionRequired.map((item) => item.id)).toEqual(['overdue']);
    expect(overview.upcomingDue.map((item) => item.id)).toEqual(['new', 'progress']);
    expect(overview.continueLearning.map((item) => item.id)).toEqual(['progress']);
    expect(overview.newAssignments.map((item) => item.id)).toEqual(['new', 'optional']);
    expect(overview.optionalAssignments.map((item) => item.id)).toEqual(['optional']);
    expect(overview.recentlyCompleted.map((item) => item.id)).toEqual(['completed']);
  });
});
