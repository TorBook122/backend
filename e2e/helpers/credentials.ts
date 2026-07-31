export const TEST_PASSWORD = 'Password123';

export type TestUserCredentials = {
  name: string;
  email: string;
  phone: string;
  password: string;
};

export function uniqueTestUser(prefix: 'customer' | 'owner'): TestUserCredentials {
  const stamp = Date.now().toString();
  return {
    name: prefix === 'customer' ? 'לקוח בדיקה' : 'בעל עסק בדיקה',
    email: `${prefix}-${stamp}@e2e.test`,
    phone: `05${stamp.slice(-8)}`,
    password: TEST_PASSWORD,
  };
}
