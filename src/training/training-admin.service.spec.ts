import { TrainingCourseStatus } from '@prisma/client';
import { allowedTrainingCourseTransitions } from './training-admin.service';

describe('training course editorial workflow', () => {
  it('requires review and approval before publishing', () => {
    expect(allowedTrainingCourseTransitions.DRAFT).toContain(
      TrainingCourseStatus.IN_REVIEW,
    );
    expect(allowedTrainingCourseTransitions.DRAFT).not.toContain(
      TrainingCourseStatus.PUBLISHED,
    );
    expect(allowedTrainingCourseTransitions.IN_REVIEW).toContain(
      TrainingCourseStatus.APPROVED,
    );
    expect(allowedTrainingCourseTransitions.APPROVED).toContain(
      TrainingCourseStatus.PUBLISHED,
    );
  });

  it('supports scheduling, pausing and controlled retirement', () => {
    expect(allowedTrainingCourseTransitions.APPROVED).toContain(
      TrainingCourseStatus.SCHEDULED,
    );
    expect(allowedTrainingCourseTransitions.PUBLISHED).toContain(
      TrainingCourseStatus.PAUSED,
    );
    expect(allowedTrainingCourseTransitions.PAUSED).toContain(
      TrainingCourseStatus.PUBLISHED,
    );
    expect(allowedTrainingCourseTransitions.RETIRED).toHaveLength(0);
  });
});
