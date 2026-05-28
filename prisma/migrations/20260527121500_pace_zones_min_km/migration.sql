-- Convert pace zones from speeds to seconds per kilometer, displayed as min/km.
UPDATE "IntensityZone"
SET
    "minValue" = ROUND(3600.0 / "maxValue"),
    "maxValue" = ROUND(3600.0 / "minValue"),
    "unit" = 'min/km'
WHERE "type" = 'PACE' AND "unit" = 'km/h';

UPDATE "IntensityZone"
SET
    "minValue" = ROUND(1000.0 / "maxValue"),
    "maxValue" = ROUND(1000.0 / "minValue"),
    "unit" = 'min/km'
WHERE "type" = 'PACE' AND "unit" = 'm/s';

UPDATE "IntensityZone"
SET "unit" = 'min/km'
WHERE "type" = 'PACE' AND "unit" = 's/km';
