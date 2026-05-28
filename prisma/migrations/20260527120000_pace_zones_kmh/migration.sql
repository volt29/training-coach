-- Convert pace zones from seconds per kilometer or meters per second to kilometers per hour.
CREATE TABLE "new_IntensityZone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minValue" REAL NOT NULL,
    "maxValue" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "new_IntensityZone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_IntensityZone" (
    "id",
    "userId",
    "type",
    "name",
    "minValue",
    "maxValue",
    "unit",
    "sortOrder",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "userId",
    "type",
    "name",
    CASE
        WHEN "type" = 'PACE' AND "unit" = 's/km' THEN ROUND(3600.0 / "maxValue", 1)
        WHEN "type" = 'PACE' AND "unit" = 'm/s' THEN ROUND("minValue" * 3.6, 1)
        ELSE "minValue"
    END,
    CASE
        WHEN "type" = 'PACE' AND "unit" = 's/km' THEN ROUND(3600.0 / "minValue", 1)
        WHEN "type" = 'PACE' AND "unit" = 'm/s' THEN ROUND("maxValue" * 3.6, 1)
        ELSE "maxValue"
    END,
    CASE
        WHEN "type" = 'PACE' AND "unit" IN ('s/km', 'm/s') THEN 'km/h'
        ELSE "unit"
    END,
    "sortOrder",
    "createdAt",
    "updatedAt"
FROM "IntensityZone";

DROP TABLE "IntensityZone";
ALTER TABLE "new_IntensityZone" RENAME TO "IntensityZone";
CREATE INDEX "IntensityZone_userId_type_idx" ON "IntensityZone"("userId", "type");
