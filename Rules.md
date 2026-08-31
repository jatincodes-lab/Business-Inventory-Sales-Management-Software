# AI Development Rules & Project Standards

> **Purpose:**  
> This file contains mandatory development rules for AI assistants and developers working on this project.  
> **Do not ignore these rules. Apply them to every new page, form, API, database operation, report, and UI component unless the requirement explicitly says otherwise.**

---

## 1. General Rule

- [ ] Always understand the existing project structure before creating new files.
- [ ] Reuse existing components, helpers, layouts, CSS classes, utilities, and patterns where possible.
- [ ] Do not create duplicate functionality if an existing implementation can be reused.
- [ ] Do not change existing functionality unnecessarily.
- [ ] Do not remove existing validation, security checks, or business logic unless explicitly requested.
- [ ] Keep code simple, readable, maintainable, and consistent with the existing project.
- [ ] Do not make assumptions about business rules. Ask when a business rule is unclear.
- [ ] Do not hard-code values that should come from configuration or the database.
- [ ] Do not introduce unnecessary libraries/packages.

---

# 2. Input Validation

Every input field must have appropriate validation.

## 2.1 Text Fields

- [ ] Text fields must accept only the characters appropriate for that field.
- [ ] Apply maximum length.
- [ ] Apply minimum length where required.
- [ ] Trim unnecessary leading/trailing spaces.
- [ ] Do not allow only-whitespace values where a value is required.
- [ ] Do not allow unexpected special characters when the field has a restricted format.
- [ ] Validate both client-side and server-side.

---

# 3. Numeric Fields

If a field contains a numeric value:

- [ ] The input must accept numbers only.
- [ ] Characters such as `A-Z`, `a-z`, and unrelated special characters must not be accepted.
- [ ] Numeric fields must be **right aligned**.
- [ ] Define the maximum allowed value where applicable.
- [ ] Define the minimum allowed value where applicable.
- [ ] Define whether negative numbers are allowed.
- [ ] Define whether decimal numbers are allowed.
- [ ] Define the maximum number of decimal places.
- [ ] Do not silently convert invalid input into `0`.
- [ ] Validate numeric values on the server as well.
- [ ] Use the correct database numeric type.

### Example

```text
Quantity        → Numeric → Right aligned
Amount          → Decimal → Right aligned
Percentage      → Decimal → Right aligned
Age             → Integer → Right aligned
Year            → Integer → Right aligned
```

---

# 4. Mobile Number

For Indian mobile numbers:

- [ ] Mobile number field must accept digits only.
- [ ] Maximum length must be **10 digits**.
- [ ] Minimum length must be **10 digits** when required.
- [ ] Do not allow alphabets.
- [ ] Do not allow spaces unless explicitly required.
- [ ] Do not allow special characters unless explicitly required.
- [ ] Do not allow more than 10 digits.
- [ ] Validate the mobile number on both client and server.
- [ ] If the project requires Indian mobile validation, normally validate that the number starts with `6`, `7`, `8`, or `9`.

Example:

```text
9876543210   ✓
9123456789   ✓
1234567890   ✗
98765abc10   ✗
98765432101  ✗
987-654-3210 ✗
```

---

# 5. Telephone / Phone Fields

- [ ] Allow only the format required by the business.
- [ ] Define maximum length.
- [ ] Define minimum length.
- [ ] Do not assume telephone numbers are always mobile numbers.
- [ ] Do not apply Indian mobile validation to a landline field unless required.

---

# 6. Email Fields

- [ ] Validate email format.
- [ ] Apply maximum length.
- [ ] Trim leading/trailing spaces.
- [ ] Store email consistently.
- [ ] Do not allow invalid email formats.
- [ ] Server-side validation is mandatory.

Example:

```text
user@example.com       ✓
user.name@example.com  ✓
user@example           ✗
@example.com           ✗
user @example.com      ✗
```

---

# 7. Name Fields

For fields such as:

- Full Name
- First Name
- Middle Name
- Last Name
- Father Name
- Mother Name
- Guardian Name

Rules:

- [ ] Allow alphabetic characters and spaces.
- [ ] Allow appropriate local-language characters if the project supports them.
- [ ] Do not allow numbers unless explicitly required.
- [ ] Do not allow unnecessary special characters.
- [ ] Apply appropriate maximum length.
- [ ] Trim leading/trailing spaces.
- [ ] Prevent multiple unnecessary consecutive spaces where appropriate.

---

# 8. Address Fields

Address fields are more flexible.

- [ ] Allow letters.
- [ ] Allow numbers.
- [ ] Allow spaces.
- [ ] Allow commonly required punctuation.
- [ ] Apply a reasonable maximum length.
- [ ] Do not use overly restrictive alphabet-only validation.

---

# 9. PIN / Postal Code

For Indian PIN codes:

- [ ] Accept digits only.
- [ ] Maximum length = 6 digits.
- [ ] Minimum length = 6 digits where required.
- [ ] Do not allow alphabets.
- [ ] Do not allow unnecessary spaces or special characters.
- [ ] Validate on client and server.

Example:

```text
226001 ✓
110001 ✓
22600  ✗
2260011 ✗
22A001 ✗
```

---

# 10. Date Fields

- [ ] Use a consistent date format throughout the project.
- [ ] Do not rely only on browser date parsing.
- [ ] Validate dates on the server.
- [ ] Validate minimum date where applicable.
- [ ] Validate maximum date where applicable.
- [ ] Do not allow future dates when the field represents a historical event.
- [ ] Do not allow past dates when the field requires a future date.
- [ ] Validate date ranges.

Example:

```text
From Date <= To Date
Start Date <= End Date
DOB <= Today
```

---

# 11. Date of Birth

For DOB:

- [ ] Do not allow future dates.
- [ ] Validate reasonable age limits when applicable.
- [ ] Do not allow invalid dates.
- [ ] Store using an appropriate database date type.
- [ ] Display using the project's standard date format.

---

# 12. Dropdowns

- [ ] Do not allow an invalid/default value to be submitted.
- [ ] Required dropdowns must have a valid selection.
- [ ] Use a clear placeholder such as `Select`.
- [ ] Server-side validation must verify that the selected ID actually exists.
- [ ] Do not trust IDs received from the browser.

Example:

```text
Select Class       → Required
Select Department  → Required
Select Gender      → Required
```

---

# 13. Checkboxes / Radio Buttons

- [ ] Validate required selections.
- [ ] Do not assume unchecked values are valid.
- [ ] Server-side validation must verify submitted values.
- [ ] Radio buttons should be used when only one option is allowed.
- [ ] Checkboxes should be used when multiple options are allowed.

---

# 14. File Upload

For every file upload:

- [ ] Validate file extension.
- [ ] Validate MIME/content type where applicable.
- [ ] Validate maximum file size.
- [ ] Do not trust the original filename.
- [ ] Generate a safe server-side filename.
- [ ] Prevent executable files from being uploaded where inappropriate.
- [ ] Store uploads outside executable directories where possible.
- [ ] Validate the file again on the server.
- [ ] Do not expose sensitive filesystem paths to users.

---

# 15. Password Fields

- [ ] Never store plain-text passwords.
- [ ] Never log passwords.
- [ ] Never return passwords through APIs.
- [ ] Use secure password hashing.
- [ ] Apply minimum password requirements according to project requirements.
- [ ] Confirm-password fields must match.
- [ ] Password inputs must use appropriate password controls.

---

# 16. Search Fields

- [ ] Search inputs must have reasonable maximum length.
- [ ] Trim unnecessary spaces.
- [ ] Prevent SQL injection.
- [ ] Use parameterized queries.
- [ ] Do not concatenate user input directly into SQL.
- [ ] Apply appropriate search/debounce behavior where needed.

---

# 17. Currency / Amount Fields

For amount fields:

- [ ] Accept only valid numeric/decimal values.
- [ ] Right align values.
- [ ] Define decimal precision.
- [ ] Define maximum value.
- [ ] Define whether zero is allowed.
- [ ] Define whether negative values are allowed.
- [ ] Display currency consistently.
- [ ] Do not use floating-point types where exact financial precision is required.
- [ ] Use appropriate database decimal types.

Example:

```text
Amount → DECIMAL(18,2)
```

---

# 18. Percentage Fields

- [ ] Accept numeric values only.
- [ ] Right align.
- [ ] Define allowed range.
- [ ] Normally percentage should be between `0` and `100` unless the business rule says otherwise.
- [ ] Define decimal precision.

Example:

```text
0      ✓
50     ✓
99.50  ✓
100    ✓
101    ✗
```

---

# 19. UI Alignment Rules

Use logical alignment based on data type.

| Data Type | Alignment |
|---|---|
| Text | Left |
| Name | Left |
| Address | Left |
| Email | Left |
| Numeric | Right |
| Amount | Right |
| Currency | Right |
| Percentage | Right |
| Quantity | Right |
| Date | Center |
| Time | Center |
| Status | Center |
| Action Buttons | Center |
| Checkbox | Center |

- [ ] Do not center normal text unnecessarily.
- [ ] Do not left-align numeric values in tables/forms unless there is a specific design reason.
- [ ] Maintain consistent alignment throughout the application.

---

# 20. Tables / Grid

Every data table should follow these rules:

- [ ] Text columns → Left aligned.
- [ ] Numeric columns → Right aligned.
- [ ] Date columns → Center aligned.
- [ ] Status → Center aligned.
- [ ] Action columns → Center aligned.
- [ ] Currency → Right aligned.
- [ ] Percentage → Right aligned.
- [ ] Long text should not break the entire layout.
- [ ] Use pagination for large datasets.
- [ ] Display a clear empty-state message when no records exist.
- [ ] Avoid unnecessary horizontal scrolling.

---

# 21. Required Fields

- [ ] Required fields must be clearly indicated.
- [ ] Do not submit forms with missing mandatory values.
- [ ] Required validation must exist on the server.
- [ ] Error messages must identify the actual field/problem.
- [ ] Do not show generic errors when a specific validation message is possible.

Bad:

```text
Invalid input.
```

Better:

```text
Mobile number must contain exactly 10 digits.
```

---

# 22. Error Messages

Error messages should:

- [ ] Be clear.
- [ ] Be short.
- [ ] Tell the user how to correct the problem.
- [ ] Appear near the relevant field where possible.
- [ ] Never expose SQL errors, stack traces, connection strings, or internal system details.

---

# 23. API Validation

Never trust data received from the client.

- [ ] Validate every API parameter.
- [ ] Validate data types.
- [ ] Validate required fields.
- [ ] Validate maximum lengths.
- [ ] Validate IDs.
- [ ] Validate authorization.
- [ ] Validate business rules.
- [ ] Return appropriate HTTP status codes.
- [ ] Do not expose sensitive information in API responses.

---

# 24. SQL / Database Rules

- [ ] Always use parameterized SQL.
- [ ] Never concatenate user input into SQL queries.
- [ ] Use appropriate data types.
- [ ] Avoid unnecessary `VARCHAR(MAX)` / `NVARCHAR(MAX)`.
- [ ] Define appropriate column lengths.
- [ ] Use proper primary keys.
- [ ] Use foreign keys where appropriate.
- [ ] Add indexes where justified by query usage.
- [ ] Avoid `SELECT *` in production queries/procedures where possible.
- [ ] Use transactions for operations that must succeed/fail together.
- [ ] Handle errors appropriately.
- [ ] Avoid unnecessary database calls.

---

# 25. Stored Procedures

When using stored procedures:

- [ ] Use strongly typed parameters.
- [ ] Validate parameters.
- [ ] Use `SET NOCOUNT ON`.
- [ ] Use transactions where required.
- [ ] Handle errors appropriately.
- [ ] Do not construct dynamic SQL unnecessarily.
- [ ] If dynamic SQL is required, parameterize it.
- [ ] Return only required columns.
- [ ] Do not modify existing stored procedures unless explicitly requested.
- [ ] Preserve existing business logic when formatting/refactoring.

---

# 26. Security

- [ ] Never trust client-side validation alone.
- [ ] Validate authorization on the server.
- [ ] Validate that the logged-in user has access to the requested record.
- [ ] Prevent SQL injection.
- [ ] Prevent XSS.
- [ ] Prevent CSRF where applicable.
- [ ] Do not expose secrets in source code.
- [ ] Do not expose connection strings.
- [ ] Do not expose API keys.
- [ ] Do not expose passwords.
- [ ] Do not log sensitive information.

---

# 27. IDs and Authorization

Never assume that because a user can send an ID, they are allowed to access that record.

Example:

```text
/api/student/1001
```

The server must verify that the current user is authorized to access student `1001`.

- [ ] Validate ownership/access.
- [ ] Do not rely only on hidden fields.
- [ ] Do not rely only on URL parameters.
- [ ] Do not rely only on UI restrictions.

---

# 28. Null / Empty Values

Always handle:

```text
NULL
""
" "
0
false
```

according to the business meaning.

- [ ] Do not automatically convert NULL to empty string everywhere.
- [ ] Do not automatically convert NULL numeric values to zero unless required.
- [ ] Do not assume an empty value means zero.
- [ ] Handle nullable database fields correctly.

---

# 29. Boolean Values

- [ ] Use proper boolean/bit types where appropriate.
- [ ] Do not mix `true`, `false`, `1`, `0`, `"Y"`, `"N"` unnecessarily.
- [ ] Follow the existing project's convention.

---

# 30. Loading / Save Buttons

During form submission:

- [ ] Prevent accidental double submission.
- [ ] Disable the submit button while processing where appropriate.
- [ ] Show a loading state for long-running operations.
- [ ] Restore the button if the request fails.
- [ ] Do not create duplicate records because the user clicked Save multiple times.

---

# 31. Delete Operations

- [ ] Do not perform destructive operations without confirmation when appropriate.
- [ ] Verify authorization.
- [ ] Verify that the record exists.
- [ ] Consider dependencies before deletion.
- [ ] Use soft delete where the project/business rules require it.
- [ ] Never delete records simply because the UI hides them.

---

# 32. Edit Operations

- [ ] Verify that the record exists.
- [ ] Verify that the user has permission to edit it.
- [ ] Validate all submitted values again.
- [ ] Do not trust hidden fields.
- [ ] Prevent updating a record belonging to another user/tenant/school/company.

---

# 33. Multi-Tenant / School / Company Data

If the application supports multiple organizations such as:

```text
School
Company
Branch
Tenant
Department
```

then:

- [ ] Always include the appropriate tenant/organization scope.
- [ ] Never return another organization's data.
- [ ] Validate tenant ownership on the server.
- [ ] Do not trust `school_id`, `company_id`, or similar values supplied by the client.
- [ ] Apply the same restriction to INSERT, UPDATE, DELETE, SELECT, and API operations.

---

# 34. UI Consistency

- [ ] Reuse the project's existing colors.
- [ ] Reuse existing buttons.
- [ ] Reuse existing form controls.
- [ ] Keep spacing consistent.
- [ ] Keep typography consistent.
- [ ] Keep validation messages consistent.
- [ ] Do not introduce random UI styles.
- [ ] Do not create unnecessary visual complexity.

---

# 35. Responsive Design

Every new UI should be checked for:

- [ ] Desktop.
- [ ] Laptop.
- [ ] Tablet.
- [ ] Mobile.
- [ ] Small screen widths.
- [ ] Large text/content.
- [ ] Long names.
- [ ] Long error messages.
- [ ] Empty states.

---

# 36. Accessibility

- [ ] Inputs should have labels.
- [ ] Buttons should have meaningful text.
- [ ] Do not use color alone to communicate errors/status.
- [ ] Keyboard navigation should work where applicable.
- [ ] Form validation should be understandable.
- [ ] Images should have appropriate alternative text where needed.

---

# 37. Performance

- [ ] Avoid unnecessary database calls.
- [ ] Avoid unnecessary API calls.
- [ ] Do not load huge datasets when pagination is possible.
- [ ] Avoid unnecessary loops over database results.
- [ ] Optimize expensive queries.
- [ ] Avoid loading unused data.
- [ ] Avoid unnecessary frontend rendering.

---

# 38. Logging

- [ ] Log useful technical information.
- [ ] Do not log passwords.
- [ ] Do not log API keys.
- [ ] Do not log connection strings.
- [ ] Do not log sensitive personal information unnecessarily.
- [ ] Include enough context to diagnose errors.
- [ ] Use appropriate log levels.

---

# 39. Code Quality

- [ ] Use meaningful variable names.
- [ ] Use meaningful method/function names.
- [ ] Avoid unnecessarily long methods.
- [ ] Avoid duplicated code.
- [ ] Remove unused variables.
- [ ] Remove unused imports.
- [ ] Avoid magic numbers.
- [ ] Follow the project's existing naming conventions.
- [ ] Add comments only where they provide useful context.
- [ ] Do not add comments that simply repeat the code.

---

# 40. Before Creating a New Field

For every new input field, determine:

```text
Field Name:
Data Type:
Required:
Maximum Length:
Minimum Length:
Allowed Characters:
Numeric:
Decimal Allowed:
Negative Allowed:
Maximum Value:
Minimum Value:
Default Value:
Validation:
Database Type:
UI Alignment:
```

Example:

```text
Field Name: Mobile Number
Data Type: String
Required: Yes
Maximum Length: 10
Minimum Length: 10
Allowed Characters: 0-9
Numeric: Yes
Decimal Allowed: No
Negative Allowed: No
UI Alignment: Right
```

---

# 41. Before Creating a New Form

Check:

- [ ] Every field has validation.
- [ ] Required fields are identified.
- [ ] Numeric fields are right aligned.
- [ ] Numeric fields reject invalid characters.
- [ ] Mobile number is limited to 10 digits where applicable.
- [ ] Email is validated.
- [ ] Dates are validated.
- [ ] Dropdowns are validated.
- [ ] File uploads are validated.
- [ ] Save button prevents duplicate submission.
- [ ] Server-side validation exists.
- [ ] Error messages are meaningful.
- [ ] Form works on mobile.
- [ ] Form handles NULL/empty values correctly.

---

# 42. Before Creating a New API

Check:

- [ ] Authentication.
- [ ] Authorization.
- [ ] Parameter validation.
- [ ] Data type validation.
- [ ] Length validation.
- [ ] Business-rule validation.
- [ ] Tenant/school/company validation.
- [ ] SQL injection protection.
- [ ] Proper error handling.
- [ ] Proper response structure.
- [ ] No sensitive data leakage.

---

# 43. Before Creating a New Database Table

Check:

- [ ] Primary key.
- [ ] Appropriate data types.
- [ ] Appropriate column lengths.
- [ ] NULL/NOT NULL decision.
- [ ] Default values.
- [ ] Foreign keys where required.
- [ ] Indexes where required.
- [ ] Created date.
- [ ] Created by.
- [ ] Modified date where required.
- [ ] Modified by where required.
- [ ] Active/status field where appropriate.
- [ ] Tenant/school/company identifier where required.

---

# 44. Before Completing Any Development Task

The AI must perform this final check:

- [ ] Does the code compile/build?
- [ ] Are there syntax errors?
- [ ] Are there unused imports/references?
- [ ] Are all required fields validated?
- [ ] Are numeric fields numeric-only?
- [ ] Are numeric values right aligned?
- [ ] Are mobile numbers restricted to 10 digits where applicable?
- [ ] Are emails validated?
- [ ] Are dates validated?
- [ ] Are dropdowns validated?
- [ ] Is server-side validation present?
- [ ] Is authorization checked?
- [ ] Is SQL parameterized?
- [ ] Are NULL values handled?
- [ ] Are duplicate submissions prevented?
- [ ] Are error messages meaningful?
- [ ] Is the UI responsive?
- [ ] Has existing functionality been preserved?
- [ ] Has unnecessary code been avoided?
- [ ] Are there any security issues?
- [ ] Are there any obvious performance issues?

---

# 45. IMPORTANT AI INSTRUCTION

When generating or modifying code, **do not stop after making the requested functionality work**.

The AI must also check the implementation against this document.

A feature is considered complete only when:

```text
Functionality
    +
Validation
    +
Security
    +
UI consistency
    +
Database correctness
    +
Error handling
    +
Responsive behavior
    +
Performance
```

are all considered.

If a requested implementation conflicts with these rules, **follow the explicit user requirement first**, but clearly identify the conflict and its consequence.

Do not silently ignore these standards.