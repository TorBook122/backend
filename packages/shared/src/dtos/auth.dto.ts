import type { UserRole } from '../types/enums.js';

export type RegisterInput = {
  name: string;
  phone: string;
  email?: string;
  password: string;
  role: UserRole;
};

export type LoginInput = {
  identifier: string;
  password: string;
  rememberMe?: boolean;
};
