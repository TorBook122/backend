import { AppointmentStatus, UserRole } from '@torbook/shared';
import { hashPassword } from '@torbook/auth';
import {
  encryptPii,
  hashPii,
  normalizeEmail,
  normalizePhone,
} from '@torbook/shared';
import { prisma } from './client.js';

async function main() {
  const ownerPassword = await hashPassword('Owner123!');
  const customerPassword = await hashPassword('Customer123!');

  const ownerEmail = 'michal@example.com';
  const ownerPhone = '0521234567';
  const customerPhone = '0549876543';

  const owner = await prisma.user.upsert({
    where: { emailHash: hashPii(normalizeEmail(ownerEmail)) },
    update: {},
    create: {
      name: 'מיכל כהן',
      emailEnc: encryptPii(ownerEmail),
      emailHash: hashPii(normalizeEmail(ownerEmail)),
      phoneEnc: encryptPii(ownerPhone),
      phoneHash: hashPii(normalizePhone(ownerPhone)),
      passwordHash: ownerPassword,
      role: UserRole.BUSINESS_OWNER,
      onboardingCompletedAt: new Date(),
    },
  });

  const customer = await prisma.user.upsert({
    where: { phoneHash: hashPii(normalizePhone(customerPhone)) },
    update: {},
    create: {
      name: 'יוסי לוי',
      phoneEnc: encryptPii(customerPhone),
      phoneHash: hashPii(normalizePhone(customerPhone)),
      passwordHash: customerPassword,
      role: UserRole.CUSTOMER,
    },
  });

  const business = await prisma.business.upsert({
    where: { slug: 'misperet-michal' },
    update: {},
    create: {
      ownerId: owner.id,
      name: 'מספרת מיכל',
      slug: 'misperet-michal',
      category: 'מספרה',
      phoneEnc: encryptPii(ownerPhone),
      cancellationWindowHours: 24,
    },
  });

  const haircut = await prisma.service.upsert({
    where: { id: 'seed-service-haircut' },
    update: {},
    create: {
      id: 'seed-service-haircut',
      businessId: business.id,
      name: 'תספורת גברים',
      durationMins: 30,
      price: 8000,
      isVisible: true,
    },
  });

  await prisma.service.upsert({
    where: { id: 'seed-service-color' },
    update: {},
    create: {
      id: 'seed-service-color',
      businessId: business.id,
      name: 'צביעה',
      durationMins: 90,
      price: 25000,
      isVisible: true,
    },
  });

  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    const isActive = dayOfWeek !== 5;
    await prisma.availability.upsert({
      where: { businessId_dayOfWeek: { businessId: business.id, dayOfWeek } },
      update: { isActive, startTime: '09:00', endTime: '18:00' },
      create: {
        businessId: business.id,
        dayOfWeek,
        isActive,
        startTime: '09:00',
        endTime: '18:00',
      },
    });
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setMinutes(tomorrowEnd.getMinutes() + 30);

  await prisma.appointment.upsert({
    where: { id: 'seed-appointment-1' },
    update: {},
    create: {
      id: 'seed-appointment-1',
      businessId: business.id,
      customerId: customer.id,
      serviceId: haircut.id,
      startsAt: tomorrow,
      endsAt: tomorrowEnd,
      status: AppointmentStatus.CONFIRMED,
    },
  });

  // eslint-disable-next-line no-console
  console.log('Seed complete:', { owner: owner.id, customer: customer.id, business: business.slug });
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
