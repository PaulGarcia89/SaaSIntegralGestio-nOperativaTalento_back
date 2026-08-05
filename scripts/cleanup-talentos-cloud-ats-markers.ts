import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const tenantSlug = 'talentos-cloud-usa';
const apply = process.argv.includes('--apply');

const cleanLabel = (value: string) => value
  .replace(/\bdemo\b/gi, '')
  .replace(/\s{2,}/g, ' ')
  .replace(/\s+-/g, ' -')
  .trim();

const hasMarker = (value?: string | null) => Boolean(value && /\bdemo\b/i.test(value));
const isPlaceholderUrl = (value?: string | null) => Boolean(value && (
  /demo-ats|talento-operaciones|\/demo(?:\/|$)|\/perfil-operativo(?:\/|$)/i.test(value)
));

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, name: true } });
  if (!tenant) throw new Error(`No existe la empresa ${tenantSlug}`);

  const [candidates, accounts, vacancies, requisitions, competencies, criteria, responses, vacancyTemplates, scorecardTemplates, communicationTemplates, interviews, assessments] = await Promise.all([
    prisma.candidate.findMany({ where: { tenantId: tenant.id }, select: { id: true, fullName: true, linkedinUrl: true, portfolioUrl: true } }),
    prisma.candidateAccount.findMany({ where: { candidates: { some: { tenantId: tenant.id } } }, select: { id: true, fullName: true, linkedinUrl: true, portfolioUrl: true } }),
    prisma.vacancy.findMany({ where: { tenantId: tenant.id }, select: { id: true, title: true } }),
    prisma.personnelRequisition.findMany({ where: { tenantId: tenant.id }, select: { id: true, title: true } }),
    prisma.scorecardCompetency.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true } }),
    prisma.scorecardCriterion.findMany({ where: { tenantId: tenant.id }, select: { id: true, competencyName: true } }),
    prisma.interviewScorecardResponse.findMany({ where: { tenantId: tenant.id }, select: { id: true, competencyName: true } }),
    prisma.vacancyFormTemplate.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true } }),
    prisma.scorecardTemplate.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true } }),
    prisma.atsCommunicationTemplate.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true } }),
    prisma.applicationInterview.findMany({ where: { tenantId: tenant.id }, select: { id: true, meetingUrl: true } }),
    prisma.externalCandidateAssessment.findMany({ where: { tenantId: tenant.id }, select: { id: true, launchUrl: true, reportUrl: true } }),
  ]);

  const affected = {
    candidates: candidates.filter((item) => hasMarker(item.fullName) || isPlaceholderUrl(item.linkedinUrl) || isPlaceholderUrl(item.portfolioUrl)),
    accounts: accounts.filter((item) => hasMarker(item.fullName) || isPlaceholderUrl(item.linkedinUrl) || isPlaceholderUrl(item.portfolioUrl)),
    vacancies: vacancies.filter((item) => hasMarker(item.title)),
    requisitions: requisitions.filter((item) => hasMarker(item.title)),
    competencies: competencies.filter((item) => hasMarker(item.name)),
    criteria: criteria.filter((item) => hasMarker(item.competencyName)),
    immutableResponses: responses.filter((item) => hasMarker(item.competencyName)),
    vacancyTemplates: vacancyTemplates.filter((item) => hasMarker(item.name)),
    scorecardTemplates: scorecardTemplates.filter((item) => hasMarker(item.name)),
    communicationTemplates: communicationTemplates.filter((item) => hasMarker(item.name)),
    interviews: interviews.filter((item) => isPlaceholderUrl(item.meetingUrl)),
    assessments: assessments.filter((item) => isPlaceholderUrl(item.launchUrl) || isPlaceholderUrl(item.reportUrl)),
  };

  const counts = Object.fromEntries(Object.entries(affected).map(([key, records]) => [key, records.length]));
  console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'PREVIEW', tenant: tenant.name, tenantSlug, counts }, null, 2));
  if (!apply) return;

  await prisma.$transaction(async (tx) => {
    for (const item of affected.candidates) await tx.candidate.update({ where: { id: item.id }, data: { fullName: cleanLabel(item.fullName), linkedinUrl: isPlaceholderUrl(item.linkedinUrl) ? null : item.linkedinUrl, portfolioUrl: isPlaceholderUrl(item.portfolioUrl) ? null : item.portfolioUrl } });
    for (const item of affected.accounts) await tx.candidateAccount.update({ where: { id: item.id }, data: { fullName: item.fullName ? cleanLabel(item.fullName) : item.fullName, linkedinUrl: isPlaceholderUrl(item.linkedinUrl) ? null : item.linkedinUrl, portfolioUrl: isPlaceholderUrl(item.portfolioUrl) ? null : item.portfolioUrl } });
    for (const item of affected.vacancies) await tx.vacancy.update({ where: { id: item.id }, data: { title: cleanLabel(item.title) } });
    for (const item of affected.requisitions) await tx.personnelRequisition.update({ where: { id: item.id }, data: { title: cleanLabel(item.title) } });
    for (const item of affected.competencies) await tx.scorecardCompetency.update({ where: { id: item.id }, data: { name: cleanLabel(item.name) } });
    for (const item of affected.criteria) await tx.scorecardCriterion.update({ where: { id: item.id }, data: { competencyName: item.competencyName ? cleanLabel(item.competencyName) : item.competencyName } });
    for (const item of affected.vacancyTemplates) await tx.vacancyFormTemplate.update({ where: { id: item.id }, data: { name: cleanLabel(item.name) } });
    for (const item of affected.scorecardTemplates) await tx.scorecardTemplate.update({ where: { id: item.id }, data: { name: cleanLabel(item.name) } });
    for (const item of affected.communicationTemplates) await tx.atsCommunicationTemplate.update({ where: { id: item.id }, data: { name: cleanLabel(item.name) } });
    for (const item of affected.interviews) await tx.applicationInterview.update({ where: { id: item.id }, data: { meetingUrl: null } });
    for (const item of affected.assessments) await tx.externalCandidateAssessment.update({ where: { id: item.id }, data: { launchUrl: isPlaceholderUrl(item.launchUrl) ? null : item.launchUrl, reportUrl: isPlaceholderUrl(item.reportUrl) ? null : item.reportUrl } });
  }, { timeout: 30_000 });

  console.log(JSON.stringify({ completed: true, tenantSlug, counts, preserved: ['emails', 'passwords', 'audit history', 'signed scorecard responses', 'messages'] }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
