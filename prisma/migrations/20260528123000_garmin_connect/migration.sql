-- CreateTable
CREATE TABLE "GarminConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "providerUserId" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenType" TEXT,
    "expiresAt" DATETIME,
    "scopes" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'mock',
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GarminConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GarminActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT,
    "externalId" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "sport" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "distanceMeters" REAL,
    "durationSeconds" INTEGER NOT NULL,
    "movingDurationSeconds" INTEGER,
    "avgHeartRate" INTEGER,
    "maxHeartRate" INTEGER,
    "avgPaceSecondsPerKm" INTEGER,
    "calories" INTEGER,
    "trainingEffect" REAL,
    "source" TEXT NOT NULL DEFAULT 'GarminConnect',
    "rawPayload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GarminActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GarminActivity_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GarminConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GarminOAuthState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "redirectTo" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GarminOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GarminConnection_userId_key" ON "GarminConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GarminActivity_userId_externalId_key" ON "GarminActivity"("userId", "externalId");

-- CreateIndex
CREATE INDEX "GarminActivity_userId_startTime_idx" ON "GarminActivity"("userId", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "GarminOAuthState_state_key" ON "GarminOAuthState"("state");

-- CreateIndex
CREATE INDEX "GarminOAuthState_userId_expiresAt_idx" ON "GarminOAuthState"("userId", "expiresAt");
