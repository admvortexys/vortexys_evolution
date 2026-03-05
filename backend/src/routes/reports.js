'use strict';
const router = require('express').Router();
const db = require('../database/db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(auth);
router.use(requirePermission('crm'));

function parseNum(val) {
  if (val === null || val === undefined) return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function buildDateFilter(query) {
  const { start_date, end_date, month, year } = query;
  if (start_date && end_date) {
    return {
      where: 'l.created_at >= $1::date AND l.created_at < $2::date + interval \'1 day\'',
      params: [start_date, end_date],
      paramOffset: 2,
    };
  }
  if (month && year) {
    return {
      where: 'EXTRACT(YEAR FROM l.created_at) = $1 AND EXTRACT(MONTH FROM l.created_at) = $2',
      params: [parseInt(year, 10), parseInt(month, 10)],
      paramOffset: 2,
    };
  }
  return {
    where: 'EXTRACT(YEAR FROM l.created_at) = EXTRACT(YEAR FROM CURRENT_DATE) AND EXTRACT(MONTH FROM l.created_at) = EXTRACT(MONTH FROM CURRENT_DATE)',
    params: [],
    paramOffset: 0,
  };
}

router.get('/crm', async (req, res, next) => {
  try {
    const df = buildDateFilter(req.query);

    // Summary
    const summaryRes = await db.query(
      `SELECT
        COUNT(*)::int as total_leads,
        COUNT(*) FILTER (WHERE l.status = 'open')::int as open,
        COUNT(*) FILTER (WHERE l.status = 'won')::int as won,
        COUNT(*) FILTER (WHERE l.status = 'lost')::int as lost,
        COALESCE(AVG(l.estimated_value) FILTER (WHERE l.status = 'won'), 0) as avg_ticket,
        COALESCE(AVG(EXTRACT(EPOCH FROM (l.updated_at - l.created_at)) / 86400) FILTER (WHERE l.status = 'won'), 0) as avg_days_to_close
      FROM leads l
      WHERE ${df.where}`,
      df.params
    );
    const s = summaryRes.rows[0];
    const total = parseNum(s.total_leads);
    const won = parseNum(s.won);
    const summary = {
      total_leads: total,
      open: parseNum(s.open),
      won,
      lost: parseNum(s.lost),
      conversion_rate: total > 0 ? parseNum((won / total) * 100) : 0,
      avg_ticket: parseNum(s.avg_ticket),
      avg_days_to_close: parseNum(s.avg_days_to_close),
    };

    // by_source
    const bySourceRes = await db.query(
      `SELECT
        COALESCE(l.source, 'Sem origem') as source,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE l.status = 'won')::int as won,
        COUNT(*) FILTER (WHERE l.status = 'lost')::int as lost,
        CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE l.status = 'won')::numeric / COUNT(*) * 100) ELSE 0 END as conversion_rate
      FROM leads l
      WHERE ${df.where}
      GROUP BY l.source`,
      df.params
    );
    const by_source = bySourceRes.rows.map((r) => ({
      source: r.source,
      total: parseNum(r.total),
      won: parseNum(r.won),
      lost: parseNum(r.lost),
      conversion_rate: parseNum(r.conversion_rate),
    }));

    // by_user
    const byUserRes = await db.query(
      `SELECT
        u.id as user_id,
        COALESCE(u.name, 'Sem responsável') as user_name,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE l.status = 'won')::int as won,
        COUNT(*) FILTER (WHERE l.status = 'lost')::int as lost,
        COALESCE(SUM(l.estimated_value) FILTER (WHERE l.status = 'won'), 0) as won_value,
        CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE l.status = 'won')::numeric / COUNT(*) * 100) ELSE 0 END as conversion_rate
      FROM leads l
      LEFT JOIN users u ON u.id = l.user_id
      WHERE ${df.where}
      GROUP BY u.id, u.name`,
      df.params
    );
    const by_user = byUserRes.rows.map((r) => ({
      user_id: r.user_id,
      user_name: r.user_name,
      total: parseNum(r.total),
      won: parseNum(r.won),
      lost: parseNum(r.lost),
      won_value: parseNum(r.won_value),
      conversion_rate: parseNum(r.conversion_rate),
    }));

    // by_pipeline
    const pipelineWhere = df.where.replace(/l\./g, 'l2.');
    const byPipelineRes = await db.query(
      `SELECT
        p.id as pipeline_id,
        p.name as pipeline_name,
        p.color,
        COUNT(l2.id)::int as total
      FROM pipelines p
      LEFT JOIN leads l2 ON l2.pipeline_id = p.id AND ${pipelineWhere}
      GROUP BY p.id, p.name, p.color, p.position
      ORDER BY p.position`,
      df.params
    );
    const by_pipeline = byPipelineRes.rows.map((r) => ({
      pipeline_id: r.pipeline_id,
      pipeline_name: r.pipeline_name,
      color: r.color,
      total: parseNum(r.total),
    }));

    // lost_reasons
    const lostReasonsRes = await db.query(
      `SELECT
        COALESCE(l.lost_reason, 'Sem motivo') as reason,
        COUNT(*)::int as count
      FROM leads l
      WHERE l.status = 'lost' AND ${df.where}
      GROUP BY l.lost_reason
      ORDER BY count DESC`,
      df.params
    );
    const lost_reasons = lostReasonsRes.rows.map((r) => ({
      reason: r.reason,
      count: parseNum(r.count),
    }));

    // monthly_evolution (last 12 months, independent of date filter)
    const monthlyRes = await db.query(
      `SELECT
        EXTRACT(YEAR FROM created_at)::int as year,
        EXTRACT(MONTH FROM created_at)::int as month,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'won')::int as won,
        COUNT(*) FILTER (WHERE status = 'lost')::int as lost,
        COALESCE(SUM(estimated_value) FILTER (WHERE status = 'won'), 0) as won_value
      FROM leads
      WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
      GROUP BY EXTRACT(YEAR FROM created_at), EXTRACT(MONTH FROM created_at)
      ORDER BY year, month`
    );
    const monthly_evolution = monthlyRes.rows.map((r) => ({
      year: parseNum(r.year),
      month: parseNum(r.month),
      total: parseNum(r.total),
      won: parseNum(r.won),
      lost: parseNum(r.lost),
      won_value: parseNum(r.won_value),
    }));

    res.json({
      summary,
      by_source,
      by_user,
      by_pipeline,
      lost_reasons,
      monthly_evolution,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/crm/funnel', async (req, res, next) => {
  try {
    const funnelRes = await db.query(
      `SELECT
        p.name,
        p.color,
        p.position,
        COUNT(l.id)::int as total,
        COALESCE(SUM(l.estimated_value), 0) as value
      FROM pipelines p
      LEFT JOIN leads l ON l.pipeline_id = p.id AND l.status = 'open'
      GROUP BY p.id, p.name, p.color, p.position
      ORDER BY p.position`
    );
    const funnel = funnelRes.rows.map((r) => ({
      name: r.name,
      color: r.color,
      position: parseNum(r.position),
      total: parseNum(r.total),
      value: parseNum(r.value),
    }));
    res.json(funnel);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
