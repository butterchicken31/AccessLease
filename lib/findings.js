const { accessPolicy } = require("../data/access-policies");
const { mockAccessGrants } = require("../data/mock-access-grants");
const { auditAccessGrants } = require("./access-audit");

function generateFindings() {
  return auditAccessGrants(mockAccessGrants, {
    getNow: () => new Date(),
    policy: accessPolicy,
  });
}

module.exports = { generateFindings };
