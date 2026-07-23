-- Preserve calendar block/break access for roles that already had schedule edit
UPDATE "EmployeeRole"
SET "permissions" = array_append("permissions", 'CALENDAR_BLOCK_HOURS'::"EmployeePermission")
WHERE 'EDIT_BUSINESS_SCHEDULE'::"EmployeePermission" = ANY ("permissions")
  AND NOT ('CALENDAR_BLOCK_HOURS'::"EmployeePermission" = ANY ("permissions"));

UPDATE "EmployeeRole"
SET "permissions" = array_append("permissions", 'CALENDAR_SET_BREAK'::"EmployeePermission")
WHERE 'EDIT_BUSINESS_SCHEDULE'::"EmployeePermission" = ANY ("permissions")
  AND NOT ('CALENDAR_SET_BREAK'::"EmployeePermission" = ANY ("permissions"));
