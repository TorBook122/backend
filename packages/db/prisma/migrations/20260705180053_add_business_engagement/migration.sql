-- CreateTable
CREATE TABLE "BusinessLike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessComment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessLike_businessId_idx" ON "BusinessLike"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessLike_userId_businessId_key" ON "BusinessLike"("userId", "businessId");

-- CreateIndex
CREATE INDEX "BusinessComment_businessId_createdAt_idx" ON "BusinessComment"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessComment_userId_businessId_key" ON "BusinessComment"("userId", "businessId");

-- AddForeignKey
ALTER TABLE "BusinessLike" ADD CONSTRAINT "BusinessLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessLike" ADD CONSTRAINT "BusinessLike_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessComment" ADD CONSTRAINT "BusinessComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessComment" ADD CONSTRAINT "BusinessComment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
