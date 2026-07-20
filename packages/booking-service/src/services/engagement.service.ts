import {
  API_ERROR_CODES,
  BUSINESS_CATEGORIES,
  analyzeCommentSentiment,
  COMMENT_PROFANITY_ERROR,
  containsProfanity,
  type BusinessCommentDto,
  type BusinessEngagementDto,
  type CategoryRankingsDto,
} from '@torbook/shared';
import { dbClient, type DbBusiness } from '../clients/db.client.js';
import { AppError } from '../utils/app-error.js';

async function getBusinessBySlugOrThrow(slug: string): Promise<DbBusiness> {
  try {
    return await dbClient.businesses.findBySlug(slug);
  } catch {
    throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'עסק לא נמצא');
  }
}

function assertNotOwnBusiness(business: DbBusiness, userId: string): void {
  if (business.ownerId === userId) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'לא ניתן לדרג את העסק שלך');
  }
}

export async function getRankings(): Promise<CategoryRankingsDto[]> {
  return dbClient.businesses.getRankings([...BUSINESS_CATEGORIES]);
}

export async function getEngagement(slug: string, userId?: string): Promise<BusinessEngagementDto> {
  const business = await getBusinessBySlugOrThrow(slug);

  const [{ count: likeCount }, { count: commentCount }, sentimentCounts] = await Promise.all([
    dbClient.likes.count(business.id),
    dbClient.comments.count(business.id),
    dbClient.comments.sentimentCounts(business.id),
  ]);

  const engagement: BusinessEngagementDto = {
    likeCount,
    commentCount,
    positiveCount: sentimentCounts.positive,
    negativeCount: sentimentCounts.negative,
    neutralCount: sentimentCounts.neutral,
    score: likeCount + sentimentCounts.positive * 2 + sentimentCounts.negative * -1,
  };

  if (!userId) {
    return engagement;
  }

  const [{ exists: likedByMe }, commentableAppointments] = await Promise.all([
    dbClient.likes.exists(userId, business.id),
    dbClient.comments.listCommentable(userId, business.id),
  ]);

  return {
    ...engagement,
    likedByMe,
    commentableAppointments,
  };
}

export async function addLike(slug: string, userId: string): Promise<{ liked: true; likeCount: number }> {
  const business = await getBusinessBySlugOrThrow(slug);
  assertNotOwnBusiness(business, userId);

  await dbClient.likes.upsert(userId, business.id);
  const { count: likeCount } = await dbClient.likes.count(business.id);

  return { liked: true, likeCount };
}

export async function removeLike(slug: string, userId: string): Promise<{ liked: false; likeCount: number }> {
  const business = await getBusinessBySlugOrThrow(slug);
  assertNotOwnBusiness(business, userId);

  await dbClient.likes.remove(userId, business.id);
  const { count: likeCount } = await dbClient.likes.count(business.id);

  return { liked: false, likeCount };
}

export async function listComments(slug: string, userId?: string): Promise<BusinessCommentDto[]> {
  const business = await getBusinessBySlugOrThrow(slug);
  return dbClient.comments.listByBusiness(business.id, userId);
}

function assertCommentTextAllowed(text: string): void {
  if (containsProfanity(text)) {
    throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, COMMENT_PROFANITY_ERROR);
  }
}

export async function createComment(
  slug: string,
  userId: string,
  appointmentId: string,
  text: string,
): Promise<BusinessCommentDto> {
  const business = await getBusinessBySlugOrThrow(slug);
  assertNotOwnBusiness(business, userId);

  assertCommentTextAllowed(text);

  try {
    const sentiment = analyzeCommentSentiment(text);
    return await dbClient.comments.create(userId, business.id, appointmentId, text, sentiment);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 403) {
      throw new AppError(
        403,
        API_ERROR_CODES.FORBIDDEN,
        'ניתן להגיב רק על תור שהתקיים ושטרם הגבת עליו',
      );
    }
    throw err;
  }
}

export async function updateComment(
  slug: string,
  userId: string,
  commentId: string,
  text: string,
): Promise<BusinessCommentDto> {
  const business = await getBusinessBySlugOrThrow(slug);
  assertNotOwnBusiness(business, userId);

  assertCommentTextAllowed(text);

  const sentiment = analyzeCommentSentiment(text);
  return dbClient.comments.update(commentId, userId, text, sentiment);
}

export async function deleteComment(slug: string, userId: string, commentId: string): Promise<void> {
  const business = await getBusinessBySlugOrThrow(slug);
  assertNotOwnBusiness(business, userId);

  await dbClient.comments.remove(commentId, userId);
}
