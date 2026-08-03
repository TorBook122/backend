export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

export type AuthUser = {
  id: string;
  name: string;
  role: string;
  onboardingCompletedAt: string | null;
  hasPhone: boolean;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  hasPassword: boolean;
};

/** Successful auth response — access JWT is set as an HttpOnly cookie, not returned in JSON. */
export type AuthTokens = {
  user: AuthUser;
};
