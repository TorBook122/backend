import { analyzeCommentSentiment } from '@torbook/shared';
import { prisma } from '../src/client.js';

async function main() {
  const comments = await prisma.businessComment.findMany({
    select: { id: true, text: true },
  });

  let updated = 0;

  for (const comment of comments) {
    const sentiment = analyzeCommentSentiment(comment.text);
    await prisma.businessComment.update({
      where: { id: comment.id },
      data: { sentiment },
    });
    updated += 1;
  }

  console.log(`Backfilled sentiment for ${updated} comment(s).`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
