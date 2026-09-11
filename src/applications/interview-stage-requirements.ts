import { BadRequestException } from '@nestjs/common';

type Interview = { status: string; startsAt: Date; endsAt: Date; interviewerUserId: string | null };
/** Shared by direct transitions, bulk updates and approval decisions. */
export function assertInterviewStageRequirements(application: {
  status: string;
  interviews?: Interview[];
  vacancy?: { stages: { applicationStatus: string }[] };
}, targetStatus: string) {
  const interviews = application.interviews ?? [];
  if (targetStatus === 'INTERVIEW' && !interviews.some((item) =>
    ['SCHEDULED', 'CONFIRMED', 'COMPLETED'].includes(item.status)
    && item.interviewerUserId && Number.isFinite(new Date(item.startsAt).getTime())
    && new Date(item.endsAt).getTime() > new Date(item.startsAt).getTime()
  )) {
    throw new BadRequestException('Agenda una entrevista con fecha, hora y entrevistador antes de pasar a esta etapa.');
  }
  if (targetStatus === 'APPROVED'
    && (application.status === 'INTERVIEW' || application.vacancy?.stages.some((stage) => stage.applicationStatus === 'INTERVIEW'))
    && !interviews.some((item) => item.status === 'COMPLETED')) {
    throw new BadRequestException('Completa la entrevista y registra su resultado antes de aprobar la postulación.');
  }
}
