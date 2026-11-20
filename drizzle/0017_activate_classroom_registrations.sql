-- Activate only existing classroom self-registrations with low-privilege student role.
-- Instructor/manager permissions still require an authenticated privileged approval.
UPDATE users SET active = 1
WHERE active = 0 AND role = 'student'
  AND id IN (SELECT user_id FROM registration_requests WHERE status = 'pending');
