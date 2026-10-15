const accessPolicy = {
  rules: [
    {
      id: "P-01",
      name: "Time-bound access",
      description: "Active grants must have valid start and end dates and must not remain active beyond their end date.",
      requiredDateFields: ["startDate", "endDate"],
      activeStatuses: ["active"],
      recognizedStatuses: ["active", "inactive", "revoked", "suspended"],
    },
    {
      id: "P-02",
      name: "Least privilege",
      description: "Grants must not contain permissions matching a broad-access pattern.",
      broadPermissionPatterns: ["*", "admin:*", "database:write", "identity:manage"],
    },
    {
      id: "P-03",
      name: "Grant ownership",
      description: "Every grant must have a recorded owner.",
      ownerRequired: true,
    },
    {
      id: "P-04",
      name: "Required review metadata",
      description: "Missing purpose or change-ticket metadata requires manual review, not automatic violation classification.",
      requiredMetadata: ["purpose", "changeTicket"],
    },
    {
      id: "P-05",
      name: "Record integrity and delegation",
      description: "Malformed, ambiguous, or circular delegation records require manual review.",
    },
  ],
};

module.exports = { accessPolicy };
