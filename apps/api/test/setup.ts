// Tests run against TEST_DATABASE_URL (falls back to DATABASE_URL). Point it at a
// throwaway database — tests create users with random emails but never clean up
// other data.
process.env.NODE_ENV = 'test';
try {
  process.loadEnvFile('.env');
} catch {
  // CI provides variables directly.
}
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.SMTP_HOST = '';
