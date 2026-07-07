export type AvailabilityDay = {
  dayOfWeek: number;
  isActive: boolean;
  startTime: string;
  endTime: string;
};

export type BreakBlockDto = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type ServiceDto = {
  id: string;
  name: string;
  durationMins: number;
  price: number;
  isVisible: boolean;
};

export type BusinessPublic = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  logoUrl: string | null;
  cancellationWindowHours: number;
  availability: AvailabilityDay[];
  breaks: BreakBlockDto[];
  services: ServiceDto[];
};

export type BusinessOwner = BusinessPublic & {
  phone: string;
};

export type AppointmentDto = {
  id: string;
  businessId: string;
  businessName: string;
  businessSlug: string;
  serviceId: string;
  serviceName: string;
  serviceDuration?: number;
  startsAt: string;
  endsAt: string;
  status: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
};

export type BusinessAppointmentStats = {
  totalAllTime: number;
  todayTotal: number;
  todayConfirmed: number;
};

export type BusinessListItem = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
};

export type FavoriteDto = {
  id: string;
  businessId: string;
  name: string;
  slug: string;
  category: string | null;
};

export type BusinessCommentDto = {
  id: string;
  text: string;
  authorName: string;
  appointmentId: string;
  serviceName: string;
  visitDate: string;
  createdAt: string;
  updatedAt: string;
  isMine?: boolean;
};

export type CommentableAppointmentDto = {
  id: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
};

export type BusinessEngagementDto = {
  likeCount: number;
  commentCount: number;
  score: number;
  likedByMe?: boolean;
  commentableAppointments?: CommentableAppointmentDto[];
};

export type RankedBusinessDto = BusinessListItem & {
  likeCount: number;
  commentCount: number;
  score: number;
};

export type CategoryRankingsDto = {
  category: string;
  businesses: RankedBusinessDto[];
};

export type TimeBlockDto = {
  id: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
};
