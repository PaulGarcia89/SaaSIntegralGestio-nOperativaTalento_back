import { SetMetadata } from '@nestjs/common';
import { ALLOWED_SUBSCRIPTION_STATES_KEY } from '../constants/auth.constants';
import { SubscriptionAccessState } from '../auth/subscription-access-state.enum';

export const AllowSubscriptionStates = (...states: SubscriptionAccessState[]) =>
  SetMetadata(ALLOWED_SUBSCRIPTION_STATES_KEY, states);
