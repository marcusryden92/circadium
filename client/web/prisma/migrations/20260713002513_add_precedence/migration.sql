-- CreateTable
CREATE TABLE "PlannerDependencies" (
    "id" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "PlannerDependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Queues" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "categoryId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "Queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueMembers" (
    "id" TEXT NOT NULL,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "queueId" TEXT NOT NULL,
    "plannerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "QueueMembers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlannerDependencies_userId_idx" ON "PlannerDependencies"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerDependencies_predecessorId_successorId_key" ON "PlannerDependencies"("predecessorId", "successorId");

-- CreateIndex
CREATE INDEX "Queues_userId_idx" ON "Queues"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "QueueMembers_plannerId_key" ON "QueueMembers"("plannerId");

-- CreateIndex
CREATE INDEX "QueueMembers_userId_idx" ON "QueueMembers"("userId");

-- AddForeignKey
ALTER TABLE "PlannerDependencies" ADD CONSTRAINT "PlannerDependencies_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "Planners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerDependencies" ADD CONSTRAINT "PlannerDependencies_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "Planners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerDependencies" ADD CONSTRAINT "PlannerDependencies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Queues" ADD CONSTRAINT "Queues_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Queues" ADD CONSTRAINT "Queues_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueMembers" ADD CONSTRAINT "QueueMembers_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueMembers" ADD CONSTRAINT "QueueMembers_plannerId_fkey" FOREIGN KEY ("plannerId") REFERENCES "Planners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueMembers" ADD CONSTRAINT "QueueMembers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
