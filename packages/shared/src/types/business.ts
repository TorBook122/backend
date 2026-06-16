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
  startsAt: string;
  endsAt: string;
  status: string;
  customerName?: string;
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

export type TimeBlockDto = {
  id: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
};
