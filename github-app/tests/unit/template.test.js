import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkPRTemplate, formatTemplateComment } from "../../src/review/template.js";

const GOOD_BODY = `
## What
This PR adds JWT signature verification to replace the insecure jwt.decode() call.

## Why
jwt.decode() does not validate the token signature, allowing forged tokens. This is a
critical security vulnerability. This PR fixes it by switching to jwt.verify().

## Testing
- Added unit tests for the verifyToken() function
- Tested manually with an expired token and a forged token
- All existing auth tests pass
`;

const PARTIAL_BODY = `
## What
Fixed the JWT issue.

## Testing
Manual testing only.
`;

const EMPTY_BODY = "";
const TOO_SHORT = "fix stuff";

describe("checkPRTemplate", () => {
  it("returns no violations for a complete template", () => {
    const violations = checkPRTemplate(GOOD_BODY);
    assert.equal(violations.length, 0, "complete PR body should have no violations");
  });

  it("flags a missing 'Why' section", () => {
    const violations = checkPRTemplate(PARTIAL_BODY);
    const whyViolation = violations.find((v) => v.id === "why");
    assert.ok(whyViolation, "should flag missing Why section");
  });

  it("returns a violation for an empty body", () => {
    const violations = checkPRTemplate(EMPTY_BODY);
    assert.ok(violations.length > 0, "empty body should have violations");
    assert.ok(violations[0].id === "no_description", "should flag as no description");
  });

  it("returns a violation for a very short body", () => {
    const violations = checkPRTemplate(TOO_SHORT);
    assert.ok(violations.length > 0, "very short body should have violations");
  });

  it("flags placeholder text as unfilled", () => {
    const bodyWithPlaceholder = `
## What
[Describe what this PR does]

## Why
Needed for performance.

## Testing
[Describe how you tested this]
    `;
    const violations = checkPRTemplate(bodyWithPlaceholder);
    const unfilled = violations.filter((v) => v.id.includes("unfilled"));
    assert.ok(unfilled.length > 0, "should detect unfilled placeholder text");
  });

  it("is case-insensitive for section headers", () => {
    const lowerCaseBody = `
## what
Fixed the JWT bug.

## why
Security issue.

## testing
Unit tests added.
    `;
    const violations = checkPRTemplate(lowerCaseBody);
    assert.equal(violations.length, 0, "should accept lowercase section headers");
  });

  it("parses a custom template when provided", () => {
    const customTemplate = `
## Summary
## Ticket
## Screenshots
    `;
    const body = `
## Summary
Added a new feature.
    `;

    const violations = checkPRTemplate(body, customTemplate);
    // Should flag missing Ticket and Screenshots sections
    assert.ok(violations.some((v) => v.id === "ticket"), "should flag missing Ticket");
    assert.ok(violations.some((v) => v.id === "screenshots"), "should flag missing Screenshots");
  });
});

describe("formatTemplateComment", () => {
  it("returns null when there are no violations", () => {
    const result = formatTemplateComment([]);
    assert.equal(result, null);
  });

  it("returns a markdown string with all violations listed", () => {
    const violations = [
      { id: "why", label: "## Why", issue: "Missing section: **## Why**", severity: "info" },
      { id: "testing", label: "## Testing", issue: "Missing section: **## Testing**", severity: "info" },
    ];

    const comment = formatTemplateComment(violations, "http://localhost:3000");
    assert.ok(typeof comment === "string", "should return a string");
    assert.ok(comment.includes("PR Template Checklist"), "should include checklist header");
    assert.ok(comment.includes("## Why"), "should include the Why violation");
    assert.ok(comment.includes("## Testing"), "should include the Testing violation");
    assert.ok(comment.includes("process reminders"), "should clarify these are not code issues");
  });
});
