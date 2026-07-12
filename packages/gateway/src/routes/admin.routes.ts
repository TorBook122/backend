import { randomUUID } from 'node:crypto';
import express, { type Request, type Response, Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { getRedis } from '../lib/redis.js';

const SESSION_COOKIE = 'torbook_admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const REDIS_SESSION_PREFIX = 'admin_session:';

const API_ROUTES = [
  { group: 'Health', routes: ['GET /health', 'GET /api/v1/health'] },
  { group: 'CSRF', routes: ['GET /api/v1/csrf'] },
  {
    group: 'Auth',
    routes: [
      'POST /api/v1/auth/register',
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/refresh',
      'POST /api/v1/auth/logout',
    ],
  },
  {
    group: 'Businesses',
    routes: [
      'POST /api/v1/businesses/onboarding/complete',
      'GET /api/v1/businesses/rankings',
      'GET /api/v1/businesses/:slug/slots',
      'GET /api/v1/businesses/:slug/engagement',
      'POST /api/v1/businesses/:slug/likes',
      'DELETE /api/v1/businesses/:slug/likes',
      'GET /api/v1/businesses/:slug/comments',
      'PUT /api/v1/businesses/:slug/comments',
      'PUT /api/v1/businesses/:slug/comments/:commentId',
      'DELETE /api/v1/businesses/:slug/comments/:commentId',
      'GET /api/v1/businesses/:slug',
      'POST /api/v1/businesses',
      'GET /api/v1/businesses/mine/owner',
      'PATCH /api/v1/businesses/:id',
      'PUT /api/v1/businesses/:id/availability',
      'PUT /api/v1/businesses/:id/breaks',
      'POST /api/v1/businesses/:id/services',
      'GET /api/v1/businesses/:id/services',
    ],
  },
  {
    group: 'Services',
    routes: ['PATCH /api/v1/services/:id', 'DELETE /api/v1/services/:id'],
  },
  {
    group: 'Appointments',
    routes: [
      'POST /api/v1/appointments/:slug/book',
      'PATCH /api/v1/appointments/:id/cancel',
      'GET /api/v1/appointments/me/upcoming',
      'GET /api/v1/appointments/business/:id/stats',
      'GET /api/v1/appointments/business/:id',
      'POST /api/v1/appointments/business/:id/time-blocks',
      'DELETE /api/v1/appointments/business/:id/time-blocks/:blockId',
      'GET /api/v1/appointments/business/:id/time-blocks',
    ],
  },
  {
    group: 'Users',
    routes: [
      'DELETE /api/v1/users/me',
      'POST /api/v1/users/me/gdpr-delete',
      'GET /api/v1/users/me/favorites',
      'POST /api/v1/users/me/favorites',
      'DELETE /api/v1/users/me/favorites/:businessId',
      'GET /api/v1/users/me/favorites/check/:slug',
      'POST /api/v1/users/me/fcm-token',
      'DELETE /api/v1/users/me/fcm-token',
    ],
  },
  {
    group: 'Admin',
    routes: [
      'GET /admin',
      'POST /admin/login',
      'GET /admin/dashboard',
      'POST /admin/logout',
    ],
  },
];

function getAdminCredentials(): { username: string; password: string } {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.warn('[admin] ADMIN_USERNAME/ADMIN_PASSWORD not set — using default dev credentials');
    return { username: 'admin', password: 'admin' };
  }

  return { username, password };
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: SESSION_TTL_MS,
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
}

function getSessionToken(req: Request): string | undefined {
  return req.cookies?.[SESSION_COOKIE] as string | undefined;
}

async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) {
    return false;
  }

  const value = await getRedis().get(`${REDIS_SESSION_PREFIX}${token}`);
  return value !== null;
}

async function createSession(): Promise<string> {
  const token = randomUUID();
  await getRedis().set(`${REDIS_SESSION_PREFIX}${token}`, '1', 'PX', SESSION_TTL_MS);
  return token;
}

async function deleteSession(token: string | undefined): Promise<void> {
  if (token) {
    await getRedis().del(`${REDIS_SESSION_PREFIX}${token}`);
  }
}

function escapeHtml(value: string | null | undefined): string {
  if (value == null) {
    return '';
  }

  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(value: string | Date | null): string {
  if (!value) {
    return '—';
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.toISOString();
}

type AdminBusiness = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  createdAt: string;
  deletedAt: string | null;
};

type AdminUser = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  createdAt: string;
  deletedAt: string | null;
};

async function fetchAdminData(): Promise<{ businesses: AdminBusiness[]; users: AdminUser[] }> {
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
  const authServiceUrl = process.env.AUTH_SERVICE_URL;
  const bookingServiceUrl = process.env.BOOKING_SERVICE_URL;

  if (!internalSecret || !authServiceUrl || !bookingServiceUrl) {
    throw new Error('Missing AUTH_SERVICE_URL, BOOKING_SERVICE_URL, or INTERNAL_SERVICE_SECRET');
  }

  const headers = { 'X-Internal-Secret': internalSecret };

  const [businessesRes, usersRes] = await Promise.all([
    fetch(`${bookingServiceUrl}/internal/v1/admin/businesses`, { headers }),
    fetch(`${authServiceUrl}/internal/v1/admin/users`, { headers }),
  ]);

  if (!businessesRes.ok || !usersRes.ok) {
    throw new Error('Failed to fetch admin dashboard data from internal services');
  }

  const businessesBody = (await businessesRes.json()) as { data: AdminBusiness[] };
  const usersBody = (await usersRes.json()) as { data: AdminUser[] };

  return {
    businesses: businessesBody.data,
    users: usersBody.data,
  };
}

function baseStyles(): string {
  return `
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 2rem;
      background: #f4f4f5;
      color: #18181b;
      line-height: 1.5;
    }
    .card {
      max-width: 420px;
      margin: 4rem auto;
      background: #fff;
      border: 1px solid #e4e4e7;
      border-radius: 8px;
      padding: 2rem;
    }
    h1 { margin: 0 0 1.5rem; font-size: 1.5rem; }
    h2 { margin: 2rem 0 1rem; font-size: 1.125rem; }
    label { display: block; margin-bottom: 0.25rem; font-size: 0.875rem; font-weight: 500; }
    input {
      width: 100%;
      padding: 0.5rem 0.75rem;
      margin-bottom: 1rem;
      border: 1px solid #d4d4d8;
      border-radius: 6px;
      font-size: 1rem;
    }
    button, .btn {
      display: inline-block;
      padding: 0.5rem 1rem;
      background: #18181b;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 0.875rem;
      cursor: pointer;
      text-decoration: none;
    }
    button:hover { background: #3f3f46; }
    .error {
      background: #fef2f2;
      color: #b91c1c;
      border: 1px solid #fecaca;
      border-radius: 6px;
      padding: 0.75rem;
      margin-bottom: 1rem;
      font-size: 0.875rem;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      border: 1px solid #e4e4e7;
      border-radius: 8px;
      overflow: hidden;
      font-size: 0.875rem;
    }
    th, td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid #e4e4e7;
    }
    th { background: #fafafa; font-weight: 600; }
    tr:last-child td { border-bottom: none; }
    details {
      background: #fff;
      border: 1px solid #e4e4e7;
      border-radius: 8px;
      padding: 1rem;
    }
    summary { cursor: pointer; font-weight: 600; }
    .route-group { margin-top: 1rem; }
    .route-group h3 { margin: 0 0 0.5rem; font-size: 0.875rem; color: #52525b; }
    .route-group ul { margin: 0; padding-left: 1.25rem; }
    .route-group li { font-family: ui-monospace, monospace; font-size: 0.8125rem; }
    .muted { color: #71717a; font-size: 0.875rem; }
  `;
}

function renderLoginPage(error?: string): string {
  const errorBlock = error ? `<div class="error">${escapeHtml(error)}</div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KvaTor Admin — Login</title>
  <style>${baseStyles()}</style>
</head>
<body>
  <div class="card">
    <h1>KvaTor Admin - מנהל מערכת</h1>
    ${errorBlock}
    <form method="POST" action="/admin/login">
      <label for="username">Username</label>
      <input id="username" name="username" type="text" required autocomplete="username">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required autocomplete="current-password">
      <button type="submit">כניסה</button>
    </form>
  </div>
</body>
</html>`;
}

function renderDashboardPage(
  businesses: AdminBusiness[],
  users: AdminUser[],
): string {
  const rows = businesses
    .map(
      (business) => `<tr>
        <td>${escapeHtml(business.id)}</td>
        <td>${escapeHtml(business.name)}</td>
        <td>${escapeHtml(business.slug)}</td>
        <td>${escapeHtml(business.category ?? '—')}</td>
        <td>${escapeHtml(formatDate(business.createdAt))}</td>
        <td>${escapeHtml(formatDate(business.deletedAt))}</td>
      </tr>`,
    )
    .join('');

  const userRows = users
    .map(
      (user) => `<tr>
        <td>${escapeHtml(user.id)}</td>
        <td>${escapeHtml(user.name)}</td>
        <td>${escapeHtml(user.email ?? '—')}</td>
        <td>${escapeHtml(user.role)}</td>
        <td>${escapeHtml(formatDate(user.createdAt))}</td>
        <td>${escapeHtml(formatDate(user.deletedAt))}</td>
      </tr>`,
    )
    .join('');


  const apiRouteGroups = API_ROUTES.map(
    (group) => `<div class="route-group">
      <h3>${escapeHtml(group.group)}</h3>
      <ul>${group.routes.map((route) => `<li>${escapeHtml(route)}</li>`).join('')}</ul>
    </div>`,
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KvaTor Admin — Dashboard</title>
  <style>${baseStyles()}</style>
</head>
<body>
  <div class="header">
    <div>
      <h1 style="margin:0">KvaTor Admin</h1>
      <p class="muted">${businesses.length} business${businesses.length === 1 ? '' : 'es'} · ${users.length} משתמש${users.length === 1 ? '' : 'ים'}</p>
    </div>
    <form method="POST" action="/admin/logout">
      <button type="submit">התנתקות</button>
    </form>
  </div>

  <h2>Businesses - עסקים</h2>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Name</th>
        <th>Slug</th>
        <th>Category</th>
        <th>Created</th>
        <th>Deleted</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="6">No businesses found.</td></tr>'}</tbody>
  </table>



  <h2>Users - משתמשים</h2>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Name</th>
        <th>Email</th>
        <th>Role</th>
        <th>Created</th>
        <th>Deleted</th>
      </tr>
    </thead>
    <tbody>${userRows || '<tr><td colspan="6">No users found.</td></tr>'}</tbody>
  </table>



  <h2>API Routes</h2>
  <details>
    <summary>Show all API endpoints</summary>
    ${apiRouteGroups}
  </details>
</body>
</html>`;
}

const router = Router();

router.use(express.urlencoded({ extended: true }));

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    if (await isValidSession(getSessionToken(req))) {
      res.redirect('/admin/dashboard');
      return;
    }

    res.type('html').send(renderLoginPage());
  }),
);

router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const { username, password } = getAdminCredentials();
    const submittedUsername = typeof req.body?.username === 'string' ? req.body.username : '';
    const submittedPassword = typeof req.body?.password === 'string' ? req.body.password : '';

    if (submittedUsername !== username || submittedPassword !== password) {
      res.status(401).type('html').send(renderLoginPage('Invalid username or password.'));
      return;
    }

    const token = await createSession();
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    res.redirect('/admin/dashboard');
  }),
);

router.get(
  '/dashboard',
  asyncHandler(async (req: Request, res: Response) => {
    const token = getSessionToken(req);

    if (!(await isValidSession(token))) {
      res.redirect('/admin');
      return;
    }

    const { businesses, users } = await fetchAdminData();

    res.type('html').send(renderDashboardPage(businesses, users));
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    await deleteSession(getSessionToken(req));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.redirect('/admin');
  }),
);

export default router;
