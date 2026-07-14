import assert from 'node:assert/strict';
import { ModuleCode } from '@prisma/client';
import {
  buildNavigation,
  mergeEnabledModules,
} from '../src/platform/utils/tenant-capabilities.util';

const merged = mergeEnabledModules(
  [ModuleCode.ATS, ModuleCode.ONBOARDING],
  [
    { moduleCode: ModuleCode.ONBOARDING, enabled: false },
    { moduleCode: ModuleCode.TRAINING, enabled: true },
  ],
);

assert.deepEqual(merged, [ModuleCode.ATS, ModuleCode.TRAINING]);

const navigation = buildNavigation([ModuleCode.ATS, ModuleCode.TRAINING]);

assert.equal(navigation.length, 2);
assert.equal(navigation[0].code, ModuleCode.ATS);
assert.deepEqual(navigation[0].routes, ['/jobs', '/candidates', '/applications', '/interviews']);
assert.equal(navigation[1].label, 'Training');

console.log('Platform capability utility tests passed');
