import {
  AdvanceRequestSchema,
  CancelActionRequestSchema,
  CreateCampaignRequestSchema,
  HistoryQuerySchema,
  IdSchema,
  PageQuerySchema,
  PlanActionRequestSchema,
  PoliticianListQuerySchema,
  TutorialUpdateSchema,
} from '@whip/contracts';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import type { ViewRequest } from '../../application/ports';
import type { AppEnv } from '../../env';
import { campaignEtag, ifNoneMatchRevision, respondRead } from '../etag';
import { validationError } from '../errors';
import { currentUser, requireUser, type SessionResolver } from '../middleware/auth';
import { optionalIdempotencyKey, requireIdempotencyKey } from '../middleware/idempotency';
import { campaignUseCases } from '../services';
import { validate } from '../validation';

const CampaignParam = z.object({ id: IdSchema });
const PoliticianParam = CampaignParam.extend({ pid: IdSchema });
const PlannedParam = CampaignParam.extend({ plannedId: IdSchema });

async function view(c: Context<AppEnv>, id: string, req: ViewRequest) {
  const result = await campaignUseCases(c).view(
    currentUser(c).id,
    id,
    req,
    ifNoneMatchRevision(c, id),
  );
  return respondRead(c, id, result);
}

/**
 * /api/v1/campaigns — docs/architecture/05-api-auth-frontend.md §1.
 *
 * Mutations under /campaigns/:id require `Idempotency-Key` and `expectedRevision`. For
 * `DELETE /:id/actions/:plannedId`, `expectedRevision` is read from the **query string**
 * (`?expectedRevision=N`); a JSON body `{ expectedRevision }` is accepted as a fallback.
 * `DELETE /:id` (soft delete) is naturally idempotent and needs neither.
 *
 * `/:id/tutorial` (docs/architecture/11-tutorial.md) is UI metadata outside the revision model:
 * no Idempotency-Key or expectedRevision (the merge is a set union), no ETag, `no-store`.
 */
export function campaignRoutes(resolveSession?: SessionResolver) {
  return (
    new Hono<AppEnv>()
      .use('*', requireUser(resolveSession))

      .get('/', validate('query', PageQuerySchema), async (c) => {
        const q = c.req.valid('query');
        const page = await campaignUseCases(c).list(currentUser(c).id, {
          limit: q.limit,
          cursor: q.cursor,
        });
        return c.json(page);
      })

      // Optional Idempotency-Key: a retry with the same key + body resumes/returns the same campaign.
      .post('/', validate('json', CreateCampaignRequestSchema), async (c) => {
        const summary = await campaignUseCases(c).create(currentUser(c).id, c.req.valid('json'), {
          idempotencyKey: optionalIdempotencyKey(c),
        });
        c.header('ETag', campaignEtag(summary.id, summary.revision));
        c.header('Location', `/api/v1/campaigns/${summary.id}`);
        return c.json(summary, 201);
      })

      .get('/:id', validate('param', CampaignParam), async (c) => {
        const { id } = c.req.valid('param');
        const summary = await campaignUseCases(c).get(currentUser(c).id, id);
        return respondRead(c, id, {
          notModified: ifNoneMatchRevision(c, id) === summary.revision,
          revision: summary.revision,
          data: summary,
        });
      })

      .delete('/:id', validate('param', CampaignParam), async (c) => {
        await campaignUseCases(c).delete(currentUser(c).id, c.req.valid('param').id);
        return c.body(null, 204);
      })

      .get('/:id/state', validate('param', CampaignParam), (c) =>
        view(c, c.req.valid('param').id, { kind: 'state' }),
      )
      .get('/:id/actions/catalogue', validate('param', CampaignParam), (c) =>
        view(c, c.req.valid('param').id, { kind: 'catalogue' }),
      )
      .get('/:id/parliament', validate('param', CampaignParam), (c) =>
        view(c, c.req.valid('param').id, { kind: 'parliament' }),
      )
      .get('/:id/party', validate('param', CampaignParam), (c) =>
        view(c, c.req.valid('param').id, { kind: 'party' }),
      )
      // Latest TurnReport (stored by the last advance); 404 NOT_FOUND before the first advance.
      .get('/:id/turn-report/latest', validate('param', CampaignParam), (c) =>
        view(c, c.req.valid('param').id, { kind: 'turn_report' }),
      )
      .get(
        '/:id/politicians',
        validate('param', CampaignParam),
        validate('query', PoliticianListQuerySchema),
        (c) =>
          view(c, c.req.valid('param').id, { kind: 'politicians', query: c.req.valid('query') }),
      )
      .get('/:id/politicians/:pid', validate('param', PoliticianParam), (c) => {
        const { id, pid } = c.req.valid('param');
        return view(c, id, { kind: 'politician', politicianId: pid });
      })

      .post(
        '/:id/actions',
        validate('param', CampaignParam),
        validate('json', PlanActionRequestSchema),
        async (c) => {
          const key = requireIdempotencyKey(c);
          const { id } = c.req.valid('param');
          const body = c.req.valid('json');
          const res = await campaignUseCases(c).planAction(currentUser(c).id, id, {
            idempotencyKey: key,
            expectedRevision: body.expectedRevision,
            action: body.action,
          });
          c.header('ETag', campaignEtag(id, res.revision));
          return c.json(res);
        },
      )

      .delete('/:id/actions/:plannedId', validate('param', PlannedParam), async (c) => {
        const key = requireIdempotencyKey(c);
        const { id, plannedId } = c.req.valid('param');
        const fromQuery = c.req.query('expectedRevision');
        const raw: unknown =
          fromQuery !== undefined
            ? { expectedRevision: /^\d+$/.test(fromQuery) ? Number(fromQuery) : fromQuery }
            : await c.req.json<unknown>().catch(() => ({}));
        const parsed = CancelActionRequestSchema.safeParse(raw);
        if (!parsed.success) throw validationError(parsed.error);
        const res = await campaignUseCases(c).cancelAction(currentUser(c).id, id, {
          idempotencyKey: key,
          expectedRevision: parsed.data.expectedRevision,
          plannedActionId: plannedId,
        });
        c.header('ETag', campaignEtag(id, res.revision));
        return c.json(res);
      })

      .post(
        '/:id/advance',
        validate('param', CampaignParam),
        validate('json', AdvanceRequestSchema),
        async (c) => {
          const key = requireIdempotencyKey(c);
          const { id } = c.req.valid('param');
          const report = await campaignUseCases(c).advance(currentUser(c).id, id, {
            idempotencyKey: key,
            expectedRevision: c.req.valid('json').expectedRevision,
          });
          c.header('ETag', campaignEtag(id, report.revision));
          return c.json(report);
        },
      )

      .get('/:id/tutorial', validate('param', CampaignParam), async (c) => {
        const state = await campaignUseCases(c).getTutorial(
          currentUser(c).id,
          c.req.valid('param').id,
        );
        c.header('Cache-Control', 'no-store');
        return c.json(state);
      })

      .put(
        '/:id/tutorial',
        validate('param', CampaignParam),
        validate('json', TutorialUpdateSchema),
        async (c) => {
          const state = await campaignUseCases(c).updateTutorial(
            currentUser(c).id,
            c.req.valid('param').id,
            c.req.valid('json'),
          );
          c.header('Cache-Control', 'no-store');
          return c.json(state);
        },
      )

      .get(
        '/:id/history',
        validate('param', CampaignParam),
        validate('query', HistoryQuerySchema),
        async (c) => {
          const { id } = c.req.valid('param');
          const result = await campaignUseCases(c).history(
            currentUser(c).id,
            id,
            c.req.valid('query'),
            ifNoneMatchRevision(c, id),
          );
          return respondRead(c, id, result);
        },
      )
  );
}
