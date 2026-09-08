import { TrainingService } from './training.service';
import { ForbiddenException } from '@nestjs/common';

describe('Mandatory video completion',()=>{
 it('rejects manual completion without verified video progress',async()=>{
  const context={prisma:{trainingLesson:{findUnique:jest.fn().mockResolvedValue({id:'l',type:'VIDEO',requiredCompletionPercentage:100,module:{courseId:'c',course:{tenantId:'t',isPublished:true}}})},trainingVideoProgress:{findFirst:jest.fn().mockResolvedValue(null)},trainingLessonProgress:{upsert:jest.fn()}}};
  await expect(TrainingService.prototype.updateLessonProgress.call(context as any,'t','u','l',{completed:true})).rejects.toBeInstanceOf(ForbiddenException);
  expect(context.prisma.trainingLessonProgress.upsert).not.toHaveBeenCalled();
 });
});
