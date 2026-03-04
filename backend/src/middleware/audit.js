'use strict';
const db = require('../database/db');

const audit = (action, module) => async (req, res, next) => {
  const original = res.json.bind(res);
  res.json = function(body) {
    if (res.statusCode < 400 && req.user) {
      db.query(
        `INSERT INTO audit_logs (user_id,action,module,target_id,ip,created_at)
         VALUES ($1,$2,$3,$4,$5,NOW())`,
        [req.user.id, action, module, req.params.id || null, req.ip]
      ).catch(() => {});
    }
    return original(body);
  };
  next();
};

module.exports = { audit };
