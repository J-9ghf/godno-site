import { route, body } from '../../../lib/http';
import * as s from '../../../lib/services/admin';
export const GET = route('admin', async (_c, a) => s.listConsentTexts(a.userId));
export const POST = route('admin', async ({ request }, a) => s.createConsentText(a.userId, await body(request, s.consentTextInput)));
